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

  // 5. ล้าง Token ที่หมดอายุทิ้ง (Scheduled Task / Cron Job)
  async deleteExpiredTokens(): Promise<number> {
    const query = `DELETE FROM refresh_tokens WHERE expires_at < NOW()`;

    const conn = await db.getConnection();
    try {
      const [result] = await conn.execute<ResultSetHeader>(query);
      console.log(`🧹 Cleanup: Deleted ${result.affectedRows} expired tokens.`);
      return result.affectedRows;
    } catch (error) {
      console.error("Failed to cleanup tokens:", error);
      return 0;
    } finally {
      conn.release();
    }
  }

  // 👇 5. เพิ่มฟังก์ชันนี้เข้าไปครับ (Logic: ลบ Token เก่าทิ้ง ถ้าเกินโควต้า)
  async rotateUserSessions(userId: string, maxSessions: number = 5): Promise<void> {
    const conn = await db.getConnection();
    try {
      // 1. ดึง Token ทั้งหมดของ User คนนี้ (เรียงจาก "ใหม่ -> เก่า")
      const querySelect = `
        SELECT token FROM refresh_tokens 
        WHERE user_id = ? 
        ORDER BY created_at DESC
      `;
      const [rows] = await conn.execute<RowDataPacket[]>(querySelect, [userId]);

      // 2. คำนวณว่าต้องลบกี่ตัว?
      // เช่น: มีอยู่ 5 ตัว, max = 5
      // เรากำลังจะเพิ่มตัวใหม่เข้าไปอีก 1 ตัว ดังนั้นต้องเหลือที่ว่างไว้ 4 ที่ (max - 1)
      const allowedCount = maxSessions - 1;

      if (rows.length > allowedCount) {
        // ตัดเอาเฉพาะตัวที่ "เกินโควต้า" (คือตัวเก่าๆ ที่อยู่ท้าย array)
        const tokensToDelete = rows.slice(allowedCount).map((r) => r.token);

        if (tokensToDelete.length > 0) {
          // 3. สั่งลบทีเดียวหลายตัว (WHERE token IN (?, ?, ?))
          const placeholders = tokensToDelete.map(() => "?").join(",");
          const queryDelete = `DELETE FROM refresh_tokens WHERE token IN (${placeholders})`;

          await conn.execute(queryDelete, tokensToDelete);
          
          console.log(`✂️ Auto-Trim: ลบ Session เก่าออก ${tokensToDelete.length} รายการ (User: ${userId})`);
        }
      }
    } catch (error) {
      console.error("Failed to rotate sessions:", error);
      // ไม่ต้อง throw error ก็ได้ เพราะไม่ใช่ critical error (แค่ลบของเก่าไม่สำเร็จ)
    } finally {
      conn.release();
    }
  }


}
