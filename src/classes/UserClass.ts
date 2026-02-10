import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import db from "../core/database";
import type { UserModel } from "../models/UserModel";
import { randomUUID } from "crypto";

type CreateUserInput = Omit<
  UserModel,
  "user_id" | "created_at" | "updated_at"
> & {
  created_at?: Date;
  updated_at?: Date;
};

type UpdateUserPatch = Partial<
  Omit<UserModel, "user_id" | "created_at" | "updated_at">
>;

export default class UserClass {
  // ===== Helpers =====
  private buildUpdateSet(patch: UpdateUserPatch) {
    const allowedKeys: (keyof UpdateUserPatch)[] = [
      "username",
      "email",
      "password",
      "phone",
      "role",
      "is_active",
    ];

    const setParts: string[] = [];
    const values: any[] = [];

    for (const key of allowedKeys) {
      const value = patch[key];
      if (typeof value !== "undefined") {
        setParts.push(`${String(key)} = ?`);
        values.push(value);
      }
    }

    return { setSql: setParts.join(", "), values };
  }

  // ===== Queries =====

  // Get all users (พร้อม join user_types + departments)
  async getAllUsers() {
    const query = `SELECT * from users;`;

    const conn = await db.getConnection();
    try {
      const [rows] = await conn.query<RowDataPacket[]>(query);
      return rows as unknown as UserModel[];
    } catch (error) {
      console.error("Failed to fetch users:", error);
      throw new Error("Failed to fetch users");
    } finally {
      conn.release();
    }
  }

  // Get user by ID (เฉพาะ users.*)
  async getUserById(uuid: string): Promise<UserModel | null> {
    const query = `SELECT * FROM users WHERE id = ? LIMIT 1;`;
    const conn = await db.getConnection();

    try {
      const [rows] = await conn.query<RowDataPacket[]>(query, [uuid]);
      return rows.length ? (rows[0] as unknown as UserModel) : null;
    } catch (error) {
      console.error("Failed to fetch user:", error);
      throw new Error("Failed to fetch user");
    } finally {
      conn.release();
    }
  }

  // Get user by email
  async getUserByEmail(email: string): Promise<UserModel | null> {
    const query = `SELECT * FROM users WHERE email = ? LIMIT 1;`;
    const conn = await db.getConnection();

    try {
      const [rows] = await conn.query<RowDataPacket[]>(query, [email]);
      return rows.length ? (rows[0] as unknown as UserModel) : null;
    } catch (error) {
      console.error("Failed to fetch user by email:", error);
      throw new Error("Failed to fetch user");
    } finally {
      conn.release();
    }
  }

  // Get user by username
  async getUserByUsername(username: string): Promise<UserModel | null> {
    const query = `SELECT * FROM users WHERE username = ? LIMIT 1;`;
    const conn = await db.getConnection();

    try {
      const [rows] = await conn.query<RowDataPacket[]>(query, [username]);
      return rows.length ? (rows[0] as unknown as UserModel) : null;
    } catch (error) {
      console.error("Failed to fetch user by username:", error);
      throw new Error("Failed to fetch user");
    } finally {
      conn.release();
    }
  }

 // Create user (คืนค่า user_id ที่ insert)
async createUser(payload: CreateUserInput): Promise<string> {
  const uuid = randomUUID();
  
  // ✅ ตรวจสอบ email ซ้ำก่อน insert
  const checkQuery = `SELECT id FROM users WHERE email = ? LIMIT 1;`;
  const conn = await db.getConnection();

  try {
    const [existing] = await conn.query<RowDataPacket[]>(checkQuery, [payload.email]);
    if (existing.length > 0) {
      throw new Error("อีเมลนี้มีอยู่แล้ว");
    }

    const query = `
      INSERT INTO users 
        (id, username, email, password, role, phone, is_active)
      VALUES 
        (?, ?, ?, ?, ?, ?, ?);
    `;

    const role = payload.role || "user";
    const phone = payload.phone || null;
    const isActive = payload.is_active ?? 1;

    const values = [
      uuid,
      payload.username,
      payload.email,
      payload.password, // ต้องเป็น hash แล้ว
      role,
      phone,
      isActive,
    ];

    await conn.query<ResultSetHeader>(query, values);

    return uuid;
  } catch (error) {
    // ✅ ตรวจจับ error ชัดเจน (duplicate key / email exists)
    if (
      error instanceof Error &&
      (error.message.includes("อีเมลนี้มีอยู่แล้ว") ||
        error.message.includes("Duplicate entry"))
    ) {
      console.warn("⚠️ อีเมลนี้มีอยู่แล้ว:", payload.email);
      throw new Error("อีเมลนี้มีอยู่แล้ว");
    }

    console.error("Failed to create user:", error);
    throw new Error("Failed to create user");
  } finally {
    conn.release();
  }
}

  // Update user (partial) - จะอัปเดต updated_at ให้ด้วยเสมอ
 async updateUser(user_id: string, patch: UpdateUserPatch): Promise<boolean> {
    const { setSql, values } = this.buildUpdateSet(patch);

    if (!setSql) return false;

    // แก้ WHERE user_id = ? เป็น WHERE id = ? ให้ตรงกับชื่อ column ใน createUser
    const query = `
      UPDATE users
      SET ${setSql},
          updated_at = ?
      WHERE id = ?; 
    `;

    const conn = await db.getConnection();
    try {
      const [result] = await conn.query<ResultSetHeader>(query, [
        ...values,
        new Date(),
        user_id,
      ]);
      return result.affectedRows > 0;
    } catch (error) {
      console.error("Failed to update user:", error);
      throw new Error("Failed to update user");
    } finally {
      conn.release();
    }
  }

  // ✅ แก้ไข: รับ user_id เป็น string (UUID)
  async updatePassword(user_id: string, passwordHash: string): Promise<boolean> {
    const query = `
      UPDATE users
      SET password = ?, updated_at = ?
      WHERE id = ?;
    `;
    const conn = await db.getConnection();

    try {
      const [result] = await conn.query<ResultSetHeader>(query, [
        passwordHash,
        new Date(),
        user_id,
      ]);
      return result.affectedRows > 0;
    } catch (error) {
      console.error("Failed to update password:", error);
      throw new Error("Failed to update password");
    } finally {
      conn.release();
    }
  }

  // ✅ แก้ไข: รับ user_id เป็น string
  async setActive(user_id: string, is_active: number): Promise<boolean> {
    const query = `
      UPDATE users
      SET is_active = ?, updated_at = ?
      WHERE id = ?;
    `;
    const conn = await db.getConnection();

    try {
      const [result] = await conn.query<ResultSetHeader>(query, [
        is_active,
        new Date(),
        user_id,
      ]);
      return result.affectedRows > 0;
    } catch (error) {
      console.error("Failed to set active:", error);
      throw new Error("Failed to set active");
    } finally {
      conn.release();
    }
  }

  // ✅ แก้ไข: รับ user_id เป็น string
  async deleteUser(user_id: string): Promise<boolean> {
    const query = `DELETE FROM users WHERE id = ?;`;
    const conn = await db.getConnection();

    try {
      const [result] = await conn.query<ResultSetHeader>(query, [user_id]);
      return result.affectedRows > 0;
    } catch (error) {
      console.error("Failed to delete user:", error);
      throw new Error("Failed to delete user");
    } finally {
      conn.release();
    }
  }
}
