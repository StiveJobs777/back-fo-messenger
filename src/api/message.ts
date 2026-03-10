import express, { Request, Response } from "express";
import { hashPass } from "../utils/hashPass";
import prisma from "../db";
import { error } from "node:console";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "your-super-secret-jwt-key";

interface senderIdMessageBody {
	id: string;
	chatID: string;
	text: string;
	senderId: string;
}

interface AuthRequest extends Request {
	userId?: string;
}

async function authMiddleware(
    req: AuthRequest,
    res: Response,
    next: express.NextFunction
) {
    try{
        const authHeader= req.headers.authorization;
        if(! authHeader || !authHeader.startsWith("Bearer ")){
            return res.status(401).json({
                error: "No token provided. Please Login first."
            })
        }
    }
    
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any
    
    const user = await prisma.user.findUnique({
        where: {id: decoded.userId},
    });

    if(!user){
        return res.status(401).json({
            erorr: "User not found. Token may be invalid."
        });

    }
}
