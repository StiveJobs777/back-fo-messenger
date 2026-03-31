import prisma from "../db";
import jwt from "jsonwebtoken";
import express, { Request, Response } from "express";

// Расширяем тип Request
declare module "express-serve-static-core" {
	interface Request {
		userId?: number;
		userEmail?: string;
		username?: string;
	}
}
 
const router = express.Router();
 
const JWT_SECRET = process.env.JWT_SECRET || "your-super-secret-jwt-key";
 
interface SendMessageBody {
	text: string;
	receiverId: number;
}
 
interface AuthRequest extends Request {
	userId?: number;
}
 
async function authMiddleware(
	req: AuthRequest,
	res: Response,
	next: express.NextFunction,
) {
	try {
		const authHeader = req.headers.authorization;
 
		if (!authHeader || !authHeader.startsWith("Bearer ")) {
			return res.status(401).json({
				error: "No token provided. Please login first.",
			});
		}
 
		const token = authHeader.split(" ")[1];
 
		const decoded = jwt.verify(token, JWT_SECRET) as any;
 
		const user = await prisma.user.findUnique({
			where: { id: decoded.userId },
		});
 
		if (!user) {
			return res.status(401).json({
				error: "User not found. Token may be invalid.",
			});
		}
 
		// устанавливаем userId в request для использования в роутах
		req.userId = user.id;
 
		next();
	} catch (e) {
		if (e instanceof jwt.JsonWebTokenError) {
			return res.status(401).json({ error: "Invalid token" });
		}
		if (e instanceof jwt.TokenExpiredError) {
			return res
				.status(401)
				.json({ error: "Token expired. Please login again." });
		}
 
		console.error("Auth middleware error:", e);
		return res.status(500).json({ error: "Internal server error" });
	}
}

//отправить сообщение
router.post(
	"/send",
	authMiddleware,
	async function (req: AuthRequest, res: Response) {
		try {
			const { text, receiverId } = req.body as SendMessageBody;
			const senderId = req.userId!;
 
			// валидация
			if (!text || !receiverId) {
				return res.status(400).json({
					error: "Text and receiverId are required",
				});
			}
 
			if (text.trim().length === 0) {
				return res.status(400).json({
					error: "Message cannot be empty",
				});
			}
 
			if (text.length > 5000) {
				return res.status(400).json({
					error: "Message is too long (max 5000 characters)",
				});
			}
 
			//ПРОВЕРКА ПОЛУЧАТЕЛЯ
			const receiver = await prisma.user.findUnique({
				where: { id: receiverId },
			});
 
			if (!receiver) {
				return res.status(404).json({
					error: "Receiver not found",
				});
			}
 
			if (senderId === receiverId) {
				return res.status(400).json({
					error: "Cannot send message to yourself",
				});
			}
 
			//СОЗДАНИЕ СООБЩЕНИЯ
			const message = await prisma.message.create({
				data: {
					text: text.trim(),
					senderId,
					receiverId,
				},
				include: {
					sender: {
						select: {
							id: true,
							username: true,
							email: true,
						},
					},
					receiver: {
						select: {
							id: true,
							username: true,
							email: true,
						},
					},
				},
			});
 
			//ОТВЕТ
			return res.status(201).json({
				message: "Message sent successfully",
				data: message,
			});
		} catch (e) {
			console.error("Send message error:", e);
			return res.status(500).json({
				error: "Internal server error",
			});
		}
	},
);

router.get(
	"/conversation/:receiverId",
	authMiddleware,
	async function (req: AuthRequest, res: Response){
		
	}
);

//получить переписку с пользователем
router.get(
	"/conversation/:receiverId",
	authMiddleware,
	async function (req: AuthRequest, res: Response) {
		try {
			const senderId = req.userId!;
			const receiverId = parseInt(req.params.receiverId as string);
 
			if (isNaN(receiverId)) {
				return res.status(400).json({ error: "Invalid receiverId" });
			}
 
			const messages = await prisma.message.findMany({
				where: {
					OR: [
						{ senderId, receiverId },
						{ senderId: receiverId, receiverId: senderId },
					],
				},
				include: {
					sender: {
						select: { id: true, username: true },
					},
					receiver: {
						select: { id: true, username: true },
					},
				},
				orderBy: { createdAt: "asc" },
			});
 
			return res.status(200).json({ data: messages });
		} catch (e) {
			console.error("Get conversation error:", e);
			return res.status(500).json({ error: "Internal server error" });
		}
	},
);

//получить список чатов текущего пользователя
router.get(
	"/chats",
	authMiddleware,
	async function (req: AuthRequest, res: Response) {
		try {
			const userId = req.userId!;
 
			//все сообщения где юзер участник
			const messages = await prisma.message.findMany({
				where: {
					OR: [{ senderId: userId }, { receiverId: userId }],
				},
				include: {
					sender: { select: { id: true, username: true } },
					receiver: { select: { id: true, username: true } },
				},
				orderBy: { createdAt: "desc" },
			});
 
			//собираем уникальных собеседников с последним сообщением
			const chatMap = new Map<number, { user: any; lastMessage: any }>();
 
			for (const msg of messages) {
				const companionId =
					msg.senderId === userId ? msg.receiverId : msg.senderId;
				const companion =
					msg.senderId === userId ? msg.receiver : msg.sender;
 
				if (!chatMap.has(companionId)) {
					chatMap.set(companionId, {
						user: companion,
						lastMessage: msg,
					});
				}
			}
 
			const chats = Array.from(chatMap.values());
 
			return res.status(200).json({ data: chats });
		} catch (e) {
			console.error("Get chats error:", e);
			return res.status(500).json({ error: "Internal server error" });
		}
	},
);

export default router;