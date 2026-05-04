import express, { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../db";
import { hashPass } from "../utils/hashPass";
import { authMiddleware, getAuthLocals } from "../middleware/auth";
import { JWT_SECRET, JWT_EXPIRES_IN } from "../config";

interface RegisterBody {
  username?: string;
  email?: string;
  password?: string;
}

interface LoginBody {
  email?: string;
  password?: string;
}

const router = express.Router();

// ── Регистрация ───────────────────────────────────────────────────────────────
router.post("/register", async function (req: Request, res: Response) {
  try {
    const { username, email, password } = req.body as RegisterBody;

    if (!email || !password || !username) {
      return res.status(400).json({ error: "Username, email and password are required" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long" });
    }

    if (username.length < 3) {
      return res.status(400).json({ error: "Username must be at least 3 characters long" });
    }

    // Проверяем занятость email и username за один запрос к БД (OR-условие).
    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ email: email.toLowerCase() }, { username }] },
    });

    if (existingUser) {
      const field = existingUser.email === email.toLowerCase() ? "email" : "username";
      return res.status(409).json({ error: `User with this ${field} already exists` });
    }

    const hashedPass = await hashPass(password);

    const newUser = await prisma.user.create({
      data: { username, email: email.toLowerCase(), password: hashedPass },
    });

    // Генерируем токен сразу — пользователь не должен делать отдельный логин.
    const token = jwt.sign(
      { userId: newUser.id, email: newUser.email, username: newUser.username },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.status(201).json({
      message: "User registered successfully",
      token,
      user: { id: newUser.id, username: newUser.username, email: newUser.email, createdAt: newUser.createAt },
    });
  } catch (e) {
    console.error("Registration error:", e);
    return res.status(500).json({ error: "Internal server error during registration" });
  }
});

// ── Вход ──────────────────────────────────────────────────────────────────────
router.post("/login", async function (req: Request, res: Response) {
  try {
    const { email, password } = req.body as LoginBody;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

    // Одно сообщение для неверного email и пароля — защита от перебора аккаунтов.
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, username: user.username },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.status(200).json({
      message: "Login successful",
      token,
      user: { id: user.id, username: user.username, email: user.email, createdAt: user.createAt },
    });
  } catch (e) {
    console.error("Login error:", e);
    return res.status(500).json({ error: "Internal server error during login" });
  }
});

// ── Выход ─────────────────────────────────────────────────────────────────────
// JWT stateless — «настоящий» выход делается на клиенте (удалить токен).
// Этот роут просто подтверждает действие.
router.post("/logout", (_req: Request, res: Response) => {
  return res.status(200).json({ message: "Logout successful" });
});

// ── Проверка токена ───────────────────────────────────────────────────────────
// authMiddleware проверяет токен и кладёт userId в res.locals.
// Роут просто возвращает данные пользователя.
router.get("/verify", authMiddleware, async function (_req: Request, res: Response) {
  try {
    // getAuthLocals — типизированный хелпер для чтения res.locals
    const { userId } = getAuthLocals(res);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    return res.status(200).json({
      valid: true,
      user: { id: user.id, username: user.username, email: user.email, createdAt: user.createAt },
    });
  } catch (e) {
    console.error("Verify error:", e);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── Обновление токена ─────────────────────────────────────────────────────────
// Принимает ИСТЁКШИЙ токен (ignoreExpiration: true) и выдаёт новый.
router.post("/refresh", async function (req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    const oldToken = authHeader.split(" ")[1];

    const decoded = jwt.verify(oldToken, JWT_SECRET, { ignoreExpiration: true }) as {
      userId: number;
      email: string;
      username: string;
    };

    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    const newToken = jwt.sign(
      { userId: user.id, email: user.email, username: user.username },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.status(200).json({ message: "Token refreshed", token: newToken });
  } catch (e) {
    console.error("Refresh token error:", e);
    return res.status(401).json({ error: "Invalid token" });
  }
});

export default router;