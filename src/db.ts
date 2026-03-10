// import { Pool } from "pg";

// const pool = new Pool({
//   user: "postgres",
//   host: "localhost",
//   database: "shop",
//   password: "postgres",
//   port: 5432,
// });
// const createTable = async () => {
//   const queryCommand = `
//     CREATE TABLE IF NOT EXISTS users (
//       id SERIAL PRIMARY KEY,
//       username VARCHAR(50) UNIQUE NOT NULL,
//       email VARCHAR(100) UNIQUE NOT NULL,
//       password VARCHAR(255) NOT NULL,
//       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//     );
//   `;
//   try {
//     await pool.query(queryCommand);
//     console.log("users таблица создана");
//   } catch (e) {
//     console.log("ошибка", e);
//   }
// };

// createTable();

// export { pool };

import { PrismaClient } from "./generated/prisma/client";
const prisma = new PrismaClient();
export default prisma;
