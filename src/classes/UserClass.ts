import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import db from "../core/database";
import type { UserModel } from "../models/UserModel";

// กรณี join เอาชื่อ type/department เพิ่ม
export type UserWithRelations = UserModel & {
  type_name: string;
  department_name: string;
  department_description: string | null;
};

type CreateUserInput = Omit<UserModel, "user_id" | "created_at" | "updated_at"> & {
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
      "first_name",
      "last_name",
      "phone",
      "user_type_id",
      "department_id",
      "company_name",
      "tax_id",
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
  async getAllUsers(): Promise<UserWithRelations[]> {
    const query = `
      SELECT 
        u.*,
        ut.type_name,
        d.department_name,
        d.description AS department_description
      FROM users AS u
      JOIN user_types AS ut ON u.user_type_id = ut.type_id
      JOIN departments AS d ON u.department_id = d.department_id
      ORDER BY u.user_id DESC;
    `;

    const conn = await db.getConnection();
    try {
      const [rows] = await conn.query<RowDataPacket[]>(query);
      return rows as unknown as UserWithRelations[];
    } catch (error) {
      console.error("Failed to fetch users:", error);
      throw new Error("Failed to fetch users");
    } finally {
      conn.release();
    }
  }

  // Get user by ID (เฉพาะ users.*)
  async getUserById(user_id: number): Promise<UserModel | null> {
    const query = `SELECT * FROM users WHERE user_id = ? LIMIT 1;`;
    const conn = await db.getConnection();

    try {
      const [rows] = await conn.query<RowDataPacket[]>(query, [user_id]);
      return rows.length ? (rows[0] as unknown as UserModel) : null;
    } catch (error) {
      console.error("Failed to fetch user:", error);
      throw new Error("Failed to fetch user");
    } finally {
      conn.release();
    }
  }

  // Get user by ID (พร้อม join)
  async getUserWithRelationsById(user_id: number): Promise<UserWithRelations | null> {
    const query = `
      SELECT 
        u.*,
        ut.type_name,
        d.department_name,
        d.description AS department_description
      FROM users AS u
      JOIN user_types AS ut ON u.user_type_id = ut.type_id
      JOIN departments AS d ON u.department_id = d.department_id
      WHERE u.user_id = ?
      LIMIT 1;
    `;

    const conn = await db.getConnection();
    try {
      const [rows] = await conn.query<RowDataPacket[]>(query, [user_id]);
      return rows.length ? (rows[0] as unknown as UserWithRelations) : null;
    } catch (error) {
      console.error("Failed to fetch user (relations):", error);
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
  async createUser(payload: CreateUserInput): Promise<number> {
    const now = new Date();

    const query = `
      INSERT INTO users
        (username, email, password, first_name, last_name, phone,
         user_type_id, department_id, company_name, tax_id, is_active,
         created_at, updated_at)
      VALUES
        (?, ?, ?, ?, ?, ?,
         ?, ?, ?, ?, ?,
         ?, ?);
    `;

    const values = [
      payload.username,
      payload.email,
      payload.password, // ควรเป็น hash แล้ว
      payload.first_name,
      payload.last_name,
      payload.phone,
      payload.user_type_id,
      payload.department_id,
      payload.company_name,
      payload.tax_id,
      payload.is_active,
      payload.created_at ?? now,
      payload.updated_at ?? now,
    ];

    const conn = await db.getConnection();
    try {
      const [result] = await conn.query<ResultSetHeader>(query, values);
      return result.insertId;
    } catch (error) {
      console.error("Failed to create user:", error);
      throw new Error("Failed to create user");
    } finally {
      conn.release();
    }
  }

  // Update user (partial) - จะอัปเดต updated_at ให้ด้วยเสมอ
  async updateUser(user_id: number, patch: UpdateUserPatch): Promise<boolean> {
    const { setSql, values } = this.buildUpdateSet(patch);

    if (!setSql) return false; // ไม่มี field ให้ update

    const query = `
      UPDATE users
      SET ${setSql},
          updated_at = ?
      WHERE user_id = ?;
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

  // Update password อย่างเดียว
  async updatePassword(user_id: number, password: string): Promise<boolean> {
    const query = `
      UPDATE users
      SET password = ?, updated_at = ?
      WHERE user_id = ?;
    `;
    const conn = await db.getConnection();

    try {
      const [result] = await conn.query<ResultSetHeader>(query, [
        password, // ควรเป็น hash แล้ว
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

  // Activate / Deactivate
  async setActive(user_id: number, is_active: number): Promise<boolean> {
    const query = `
      UPDATE users
      SET is_active = ?, updated_at = ?
      WHERE user_id = ?;
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

  // Delete user (hard delete) — ถ้าคุณอยาก soft delete ให้ใช้ setActive(0) แทน
  async deleteUser(user_id: number): Promise<boolean> {
    const query = `DELETE FROM users WHERE user_id = ?;`;
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

  // เช็คซ้ำ email (เอาไว้ validate ก่อน create/update)
  async existsEmail(email: string, excludeUserId?: number): Promise<boolean> {
    const query = excludeUserId
      ? `SELECT 1 FROM users WHERE email = ? AND user_id <> ? LIMIT 1;`
      : `SELECT 1 FROM users WHERE email = ? LIMIT 1;`;

    const params = excludeUserId ? [email, excludeUserId] : [email];

    const conn = await db.getConnection();
    try {
      const [rows] = await conn.query<RowDataPacket[]>(query, params);
      return rows.length > 0;
    } catch (error) {
      console.error("Failed to check email exists:", error);
      throw new Error("Failed to check email exists");
    } finally {
      conn.release();
    }
  }

  // เช็คซ้ำ username
  async existsUsername(username: string, excludeUserId?: number): Promise<boolean> {
    const query = excludeUserId
      ? `SELECT 1 FROM users WHERE username = ? AND user_id <> ? LIMIT 1;`
      : `SELECT 1 FROM users WHERE username = ? LIMIT 1;`;

    const params = excludeUserId ? [username, excludeUserId] : [username];

    const conn = await db.getConnection();
    try {
      const [rows] = await conn.query<RowDataPacket[]>(query, params);
      return rows.length > 0;
    } catch (error) {
      console.error("Failed to check username exists:", error);
      throw new Error("Failed to check username exists");
    } finally {
      conn.release();
    }
  }
}
