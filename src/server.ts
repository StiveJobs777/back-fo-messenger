import express, { type Request, type Response } from "express";
import cors from "cors";
// import { pool } from "./db";

import authRouter from "./api/auth";
import { error, timeStamp } from "node:console";

const app = express();

app.use(express.json());
app.use(cors({ origin: "http://localhost:5173", credentials: true }));

app.use("/api/auth", authRouter);

app.get("/", (req, res) => {
  res.status(200).json({
     status: "ok",
     message: "chat api is runing",
     timeStamp: new Date().toISOString()
    });
});

app.use((req: Request, res: Response) =>{
  res.status(404).json({
    error : "Роутер не найден",
  })
})

const PORT = 3000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
