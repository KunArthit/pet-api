import type { RowDataPacket } from "mysql2/promise";
import db from "../core/database";
import type { UserModel } from "../models/UserModel";
import bcrypt from "bcryptjs";

// สร้าง Type ใหม่สำหรับ Return User ที่ไม่มี Password
export type UserWithoutPassword = Omit<UserModel, "password">;

export default class AuthClass {
  async login(
    email: string,
    password: string
  ): Promise<UserWithoutPassword | null> {
    const query = `SELECT * from users where email = ?`;

    try {
      const [rows] = await db.execute<RowDataPacket[]>(query, [email]);

      if (rows.length === 0) return null;

      const user = rows[0] as UserModel;

      // 1. ตรวจสอบรหัสผ่าน
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) return null;

      // ✅ 2. เพิ่ม: ตรวจสอบสถานะ Account (ถ้า is_active = 0 ห้ามเข้า)
      // หมายเหตุ: เช็คว่าใน Model คุณ define is_active เป็น number หรือ boolean
      if (user.is_active === 0) return null; 

      // 3. แยก password ออกจาก object เพื่อความปลอดภัย
      const { password: _, ...userSafe } = user;

      return userSafe;
    } catch (error) {
      console.error("AuthClass Error:", error);
      throw new Error("Database error during login");
    }
  }

    // ✅ หา user ด้วยอีเมล (ใช้ตอน forgot password)
    async findByEmail(email: string): Promise<UserWithoutPassword | null> {
      const query = `SELECT * FROM users WHERE email = ?`;
      try {
        const [rows] = await db.execute<RowDataPacket[]>(query, [email]);
        if (rows.length === 0) return null;
  
        const user = rows[0] as UserModel;
  
        // ถ้าไม่ active ก็ไม่คืนค่า
        if (user.is_active === 0) return null;
  
        const { password: _, ...userSafe } = user;
        return userSafe;
      } catch (error) {
        console.error("AuthClass.findByEmail Error:", error);
        throw new Error("Database error during findByEmail");
      }
    }
  
    // ✅ อัปเดตรหัสผ่านใหม่ (ใช้ตอน reset password)
    async updatePassword(userId: string, newHashedPassword: string): Promise<void> {
      const query = `UPDATE users SET password = ? WHERE id = ?`;
      try {
        await db.execute(query, [newHashedPassword, userId]);
      } catch (error) {
        console.error("AuthClass.updatePassword Error:", error);
        throw new Error("Database error during updatePassword");
      }
    }
}