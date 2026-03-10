import bcrypt from "bcrypt";

export async function hashPass(pass: string): Promise<string> {
  return await bcrypt.hash(pass, 10);
}
