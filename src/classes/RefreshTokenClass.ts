// classes/RefreshTokenClass.ts
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import db from "../core/database";
import type { RefreshTokenModel } from "../models/RefreshTokenModel";

export default class RefreshTokenClass {
  // 1. สร้างและบันทึก Token ลง DB
  async createRefreshToken(
    userId: string,
    token: string,
    expiresInDays: number = 7
  ): Promise<boolean> {
    // คำนวณวันหมดอายุ (ปัจจุบัน + 7 วัน)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    const query = `
      INSERT INTO refresh_tokens (user_id, token, expires_at, created_at)
      VALUES (?, ?, ?, NOW())
    `;

    const conn = await db.getConnection();
    try {
      const [result] = await conn.execute<ResultSetHeader>(query, [
        userId,
        token,
        expiresAt,
      ]);
      return result.affectedRows > 0;
    } catch (error) {
      console.error("Failed to create refresh token:", error);
      throw new Error("Database error creating refresh token");
    } finally {
      conn.release();
    }
  }

  // 2. ค้นหา Token (เอาไว้เช็คตอน User ยิงขอ Token ใหม่)
  async findToken(token: string): Promise<RefreshTokenModel | null> {
    // เช็คด้วยว่า Token ต้องยังไม่หมดอายุ (expires_at > NOW)
    const query = `
      SELECT * FROM refresh_tokens 
      WHERE token = ? AND expires_at > NOW() 
      LIMIT 1
    `;

    const conn = await db.getConnection();
    try {
      const [rows] = await conn.execute<RowDataPacket[]>(query, [token]);
      if (rows.length === 0) return null;

      return rows[0] as RefreshTokenModel;
    } catch (error) {
      console.error("Failed to find token:", error);
      return null;
    } finally {
      conn.release();
    }
  }

  // 3. ลบ Token (สำหรับ Logout หรือเมื่อ Token ถูกใช้แล้วและต้องการ Rotate)
  async revokeToken(token: string): Promise<boolean> {
    const query = `DELETE FROM refresh_tokens WHERE token = ?`;

    const conn = await db.getConnection();
    try {
      const [result] = await conn.execute<ResultSetHeader>(query, [token]);
      return result.affectedRows > 0;
    } catch (error) {
      console.error("Failed to revoke token:", error);
      return false;
    } finally {
      conn.release();
    }
  }

  // 4. ลบ Token ทั้งหมดของ User (สำหรับ Force Logout ทุกอุปกรณ์)
  async revokeAllUserTokens(userId: string): Promise<boolean> {
    const query = `DELETE FROM refresh_tokens WHERE user_id = ?`;

    const conn = await db.getConnection();
    try {
      const [result] = await conn.execute<ResultSetHeader>(query, [userId]);
      return result.affectedRows > 0;
    } catch (error) {
      console.error("Failed to revoke all user tokens:", error);
      return false;
    } finally {
      conn.release();
    }
  }
}
