import express, { Request, Response } from "express";
import { hashPass } from "../utils/hashPass";
import prisma from "../db";
import { error } from "node:console";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

interface RegisterBody {
	username?: string;
	email?: string;
	password?: string;
}

interface LoginBody {
	email?: string;
	password?: string;
}
//перенести в конфиг
const JWT_SECRET = process.env.JWT_SECRET || "your-super-secret-jwt-key";
const JWT_EXPIRES_IN = "7d"; // токен 7 дней

const router = express.Router();

router.post(
	"/login",
	async function (req: Request<{}, {}, LoginBody>, res: Response) {
		try {
			const { email, password } = req.body;

			if (!email || !password) {
				return res.status(400).json({
					error: "Email and password are required",
				});
			}

			const user = await prisma.user.findUnique({
				where: { email: email.toLowerCase() },
			});

			if (!user) {
				return res.status(401).json({
					error: "Invalid email or password",
				});
			}

			const isPasswordValid = await bcrypt.compare(
				password,
				user.password,
			);

			if (!isPasswordValid) {
				return res.status(401).json({
					error: "Invalid email or password",
				});
			}

			const token = jwt.sign(
				{
					userId: user.id,
					email: user.email,
					username: user.username,
				},
				JWT_SECRET,
				{ expiresIn: JWT_EXPIRES_IN },
			);
			await prisma.user.update({
				where: { id: user.id },
				data: {},
			});

			return res.status(200).json({
				message: "Login successful",
				token,
				user: {
					id: user.id,
					username: user.username,
					email: user.email,
					createdAt: user.createAt,
				},
			});
		} catch (e) {
			console.error("Login error:", e);
			return res.status(500).json({
				error: "Internal server error during login",
			});
		}
	},
);

router.post("/logout", async function (req: Request, res: Response) {
	try {
		return res.status(200).json({
			message: "Logout successful",
		});
	} catch (e) {
		console.error("Logout error:", e);
		return res.status(500).json({
			error: "Internal server error during logout",
		});
	}
});

router.post(
	"/register",
	async function (req: Request<{}, {}, RegisterBody>, res: Response) {
		try {
			const { username, email, password } = req.body;
			if (!email || !password || !username) {
				return res.status(400).json({
					error: "Username, email and password are required",
				});
			}

			const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
			if (!emailRegex.test(email)) {
				return res.status(400).json({
					error: "Invalid email format",
				});
			}

			// проверка длины пароля
			if (password.length < 6) {
				return res.status(400).json({
					error: "Password must be at least 6 characters long",
				});
			}

			if (username.length < 3) {
				return res.status(400).json({
					error: "Username must be at least 3 characters long",
				});
			}

			const existingUser = await prisma.user.findUnique({
				where: { email: email.toLowerCase() },
			});

			if (existingUser) {
				return res.status(409).json({
					error: "User with this email already exists",
				});
			}

			const existingUsername = await prisma.user.findUnique({
				where: { username },
			});

			if (existingUsername) {
				return res.status(409).json({
					error: "Username already taken",
				});
			}

			const hashedPass = await hashPass(password);

			const newUser = await prisma.user.create({
				data: {
					username,
					email: email.toLowerCase(),
					password: hashedPass,
				},
			});

			const token = jwt.sign(
				{
					userId: newUser.id,
					email: newUser.email,
					username: newUser.username,
				},
				JWT_SECRET,
				{ expiresIn: JWT_EXPIRES_IN },
			);

			return res.status(201).json({
				message: "User registered successfully",
				token,
				user: {
					id: newUser.id,
					username: newUser.username,
					email: newUser.email,
					// createdAt: newUser.createdAt,
				},
			});
		} catch (e) {
			console.error("Registration error:", e);
			return res.status(500).json({
				error: "Internal server error during registration",
			});
		}
	},
);
//перенести
router.get("/verify", async function (req: Request, res: Response) {
	try {
		const authHeader = req.headers.authorization;

		if (!authHeader || !authHeader.startsWith("Bearer ")) {
			return res.status(401).json({
				error: "No token provided",
			});
		}

		const token = authHeader.split(" ")[1];

		const decoded = jwt.verify(token, JWT_SECRET) as any;

		const user = await prisma.user.findUnique({
			where: { id: decoded.userId },
		});

		if (!user) {
			return res.status(401).json({
				error: "User not found",
			});
		}

		return res.status(200).json({
			valid: true,
			user: {
				id: user.id,
				username: user.username,
				email: user.email,
				createdAt: user.createAt,
			},
		});
	} catch (e) {
		if (e instanceof jwt.JsonWebTokenError) {
			return res.status(401).json({
				error: "Invalid token",
			});
		}
		if (e instanceof jwt.TokenExpiredError) {
			return res.status(401).json({
				error: "Token expired",
			});
		}

		console.error("Verify error:", e);
		return res.status(500).json({
			error: "Internal server error",
		});
	}
});

router.post("/refresh", async function (req: Request, res: Response) {
	try {
		const authHeader = req.headers.authorization;

		if (!authHeader || !authHeader.startsWith("Bearer ")) {
			return res.status(401).json({
				error: "No token provided",
			});
		}

		const oldToken = authHeader.split(" ")[1];

		const decoded = jwt.verify(oldToken, JWT_SECRET, {
			ignoreExpiration: true,
		}) as any;

		const user = await prisma.user.findUnique({
			where: { id: decoded.userId },
		});

		if (!user) {
			return res.status(401).json({
				error: "User not found",
			});
		}

		const newToken = jwt.sign(
			{
				userId: user.id,
				email: user.email,
				username: user.username,
			},
			JWT_SECRET,
			{ expiresIn: JWT_EXPIRES_IN },
		);

		return res.status(200).json({
			message: "Token refreshed",
			token: newToken,
		});
	} catch (e) {
		console.error("Refresh token error:", e);
		return res.status(401).json({
			error: "Invalid token",
		});
	}
});

export default router;
