// ─── Middleware аутентификации ────────────────────────────────────────────────
// Проверяет JWT-токен из заголовка Authorization: Bearer <token>.
// Если токен валидный — кладёт данные пользователя в res.locals и вызывает next().
// Если нет — сразу отвечает с ошибкой.

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "../db";
import { JWT_SECRET } from "../config";

// Типизируем res.locals — стандартный Express-способ передавать данные
// между middleware и роутами без изменения типа Request.
// Express 5 требует, чтобы параметр req в middleware и роутах был одного типа
// (Request), поэтому расширять Request через interface AuthRequest больше не работает.
export interface AuthLocals {
  userId: number;
  username: string;
  userEmail: string;
}

// Хелпер для удобного чтения данных из res.locals с правильным типом.
// Использование в роуте: const { userId } = getAuthLocals(res);
export function getAuthLocals(res: Response): AuthLocals {
  return res.locals as AuthLocals;
}

// Оставляем экспорт AuthRequest как псевдоним Request — для обратной совместимости,
// если где-то в проекте остались старые импорты.
export type AuthRequest = Request;

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;

    // Проверяем наличие заголовка в формате "Bearer <token>"
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided. Please login first." });
    }

    // Извлекаем сам токен (всё после "Bearer ")
    const token = authHeader.split(" ")[1];

    // jwt.verify бросает исключение, если токен невалидный или истёк.
    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId: number;
      email: string;
      username: string;
    };

    // Проверяем, что пользователь ещё существует в БД
    // (на случай если аккаунт был удалён, а токен ещё жив).
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });

    if (!user) {
      return res.status(401).json({ error: "User not found. Token may be invalid." });
    }

    // res.locals — стандартное место для данных, которые middleware передаёт роутам.
    // Живёт только в рамках одного запроса-ответа.
    res.locals.userId = user.id;
    res.locals.username = user.username;
    res.locals.userEmail = user.email;

    next();
  } catch (e) {
    if (e instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ error: "Invalid token" });
    }
    if (e instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: "Token expired. Please login again." });
    }

    console.error("Auth middleware error:", e);
    return res.status(500).json({ error: "Internal server error" });
  }
}