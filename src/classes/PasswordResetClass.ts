import db from "../core/database";
import crypto from "crypto";
import type { RowDataPacket } from "mysql2/promise";

interface PasswordResetRow extends RowDataPacket {
  user_id: string;
  token: string;
  expires_at: Date;
}

export default class PasswordResetClass {
  async create(userId: string): Promise<string> {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 15); // 15 นาที

    await db.query(
      "INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)",
      [userId, token, expiresAt]
    );

    return token;
  }

  async verify(token: string): Promise<string | null> {
    const [rows] = await db.query<PasswordResetRow[]>(
      "SELECT * FROM password_resets WHERE token = ? AND expires_at > NOW()",
      [token]
    );

    if (rows.length === 0) return null;
    return rows[0].user_id;
  }

  async delete(token: string) {
    await db.query("DELETE FROM password_resets WHERE token = ?", [token]);
  }
}