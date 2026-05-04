import "dotenv/config";

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is not set in environment variables");
}

export const JWT_SECRET = process.env.JWT_SECRET;


export const JWT_EXPIRES_IN = "7d";

export const PORT = Number(process.env.PORT) || 3000;

export const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";
