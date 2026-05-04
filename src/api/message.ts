import express, { Request, Response } from "express";
import prisma from "../db";
import { authMiddleware, getAuthLocals } from "../middleware/auth";

const router = express.Router();

// Все роуты требуют авторизации — применяем middleware на весь router.
router.use(authMiddleware);

interface SendMessageBody {
  text: string;
  receiverId: number;
}

// ── Отправить сообщение ───────────────────────────────────────────────────────
router.post("/send", async function (_req: Request, res: Response) {
  try {
    const { text, receiverId } = res.locals.body || _req.body as SendMessageBody;
    const { userId: senderId } = getAuthLocals(res);

    if (!text || !receiverId) {
      return res.status(400).json({ error: "Text and receiverId are required" });
    }
    if (text.trim().length === 0) {
      return res.status(400).json({ error: "Message cannot be empty" });
    }
    if (text.length > 5000) {
      return res.status(400).json({ error: "Message is too long (max 5000 characters)" });
    }
    if (senderId === receiverId) {
      return res.status(400).json({ error: "Cannot send message to yourself" });
    }

    const receiver = await prisma.user.findUnique({ where: { id: receiverId } });
    if (!receiver) {
      return res.status(404).json({ error: "Receiver not found" });
    }

    const message = await prisma.message.create({
      data: { text: text.trim(), senderId, receiverId },
      // include — получаем связанные данные одним запросом, без дополнительных select'ов.
      include: {
        sender: { select: { id: true, username: true, email: true } },
        receiver: { select: { id: true, username: true, email: true } },
      },
    });

    return res.status(201).json({ message: "Message sent successfully", data: message });
  } catch (e) {
    console.error("Send message error:", e);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── Переписка с пользователем ─────────────────────────────────────────────────
router.get("/conversation/:receiverId", async function (req: Request<{ receiverId: string }>, res: Response) {
  try {
    const { userId: senderId } = getAuthLocals(res);
    const receiverId = parseInt(req.params.receiverId);

    if (isNaN(receiverId)) {
      return res.status(400).json({ error: "Invalid receiverId" });
    }

    // Пагинация: ?page=1&limit=50
    // Math.max / Math.min — защита от отрицательных значений и слишком больших лимитов.
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
    const skip = (page - 1) * limit;

    // $transaction — оба запроса выполняются атомарно,
    // данные и total всегда согласованы между собой.
    const [messages, total] = await prisma.$transaction([
      prisma.message.findMany({
        where: {
          OR: [
            { senderId, receiverId },
            { senderId: receiverId, receiverId: senderId },
          ],
        },
        include: {
          sender: { select: { id: true, username: true } },
          receiver: { select: { id: true, username: true } },
        },
        orderBy: { createdAt: "asc" },
        skip,
        take: limit,
      }),
      prisma.message.count({
        where: {
          OR: [
            { senderId, receiverId },
            { senderId: receiverId, receiverId: senderId },
          ],
        },
      }),
    ]);

    return res.status(200).json({
      data: messages,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (e) {
    console.error("Get conversation error:", e);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── Список чатов ──────────────────────────────────────────────────────────────
router.get("/chats", async function (_req: Request, res: Response) {
  try {
    const { userId } = getAuthLocals(res);

    const messages = await prisma.message.findMany({
      where: { OR: [{ senderId: userId }, { receiverId: userId }] },
      include: {
        sender: { select: { id: true, username: true } },
        receiver: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Map<companionId, { user, lastMessage }> — дедупликация собеседников.
    // Так как сообщения desc, первое встречное — самое новое (lastMessage).
    const chatMap = new Map<number, { user: any; lastMessage: any }>();

    for (const msg of messages) {
      const companionId = msg.senderId === userId ? msg.receiverId : msg.senderId;
      const companion = msg.senderId === userId ? msg.receiver : msg.sender;

      if (!chatMap.has(companionId)) {
        chatMap.set(companionId, { user: companion, lastMessage: msg });
      }
    }

    return res.status(200).json({ data: Array.from(chatMap.values()) });
  } catch (e) {
    console.error("Get chats error:", e);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── Удалить сообщение ─────────────────────────────────────────────────────────
router.delete("/:id", async function (req: Request<{ id: string }>, res: Response) {
  try {
    const { userId } = getAuthLocals(res);
    const messageId = parseInt(req.params.id);

    if (isNaN(messageId)) {
      return res.status(400).json({ error: "Invalid message id" });
    }

    const message = await prisma.message.findUnique({ where: { id: messageId } });

    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    // 403 Forbidden — пользователь есть, но не имеет прав на это действие.
    if (message.senderId !== userId) {
      return res.status(403).json({ error: "You can only delete your own messages" });
    }

    await prisma.message.delete({ where: { id: messageId } });
    return res.status(200).json({ message: "Message deleted successfully" });
  } catch (e) {
    console.error("Delete message error:", e);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;