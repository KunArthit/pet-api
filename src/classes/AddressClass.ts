import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import db from "../core/database";
import type { AddressModel, CreateAddressInput, UpdateAddressInput } from "../models/AddressModel";

export default class AddressClass {
  // ===== Helpers =====
  private buildUpdateSet(patch: UpdateAddressInput) {
    const allowedKeys: (keyof UpdateAddressInput)[] = [
      "recipient_name",
      "phone",
      "address_line1",
      "address_line2",
      "sub_district",
      "district",
      "province",
      "zip_code",
      "is_default",
      "type",
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

  // ===== CRUD =====

  // 1. สร้างที่อยู่ใหม่
  async createAddress(payload: CreateAddressInput): Promise<number> {
    const query = `
      INSERT INTO addresses 
      (user_id, recipient_name, phone, address_line1, address_line2, sub_district, district, province, zip_code, is_default, type, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `;

    const values = [
      payload.user_id,
      payload.recipient_name,
      payload.phone,
      payload.address_line1,
      payload.address_line2 || null,
      payload.sub_district,
      payload.district,
      payload.province,
      payload.zip_code,
      payload.is_default || 0,
      payload.type || "shipping",
    ];

    const conn = await db.getConnection();
    try {
      // ถ้า User ตั้งให้เป็น default ตั้งแต่แรก ต้องเคลียร์อันเก่าก่อน
      if (payload.is_default === 1) {
        await conn.query("UPDATE addresses SET is_default = 0 WHERE user_id = ?", [payload.user_id]);
      }

      const [result] = await conn.query<ResultSetHeader>(query, values);
      return result.insertId;
    } catch (error) {
      console.error("Failed to create address:", error);
      throw new Error("Failed to create address");
    } finally {
      conn.release();
    }
  }

  // 2. ดึงที่อยู่ทั้งหมดของ User คนหนึ่ง
  async getAddressesByUserId(userId: string): Promise<AddressModel[]> {
    const query = `SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC`;
    
    const conn = await db.getConnection();
    try {
      const [rows] = await conn.query<RowDataPacket[]>(query, [userId]);
      return rows as AddressModel[];
    } catch (error) {
      console.error("Failed to fetch addresses:", error);
      return [];
    } finally {
      conn.release();
    }
  }

  // 3. ดึงที่อยู่ตาม ID (เอาไว้เช็คก่อนแก้)
  async getAddressById(id: number): Promise<AddressModel | null> {
    const query = `SELECT * FROM addresses WHERE id = ? LIMIT 1`;
    
    const conn = await db.getConnection();
    try {
      const [rows] = await conn.query<RowDataPacket[]>(query, [id]);
      return rows.length ? (rows[0] as AddressModel) : null;
    } catch (error) {
      console.error("Failed to fetch address:", error);
      return null;
    } finally {
      conn.release();
    }
  }

  // 4. อัปเดตที่อยู่
  async updateAddress(id: number, userId: string, patch: UpdateAddressInput): Promise<boolean> {
    const { setSql, values } = this.buildUpdateSet(patch);
    if (!setSql) return false;

    const conn = await db.getConnection();
    try {
      // ถ้ามีการตั้ง is_default = 1 ต้องเคลียร์อันอื่นก่อน
      if (patch.is_default === 1) {
        await conn.query("UPDATE addresses SET is_default = 0 WHERE user_id = ?", [userId]);
      }

      const query = `UPDATE addresses SET ${setSql}, updated_at = NOW() WHERE id = ?`;
      const [result] = await conn.query<ResultSetHeader>(query, [...values, id]);
      
      return result.affectedRows > 0;
    } catch (error) {
      console.error("Failed to update address:", error);
      throw new Error("Failed to update address");
    } finally {
      conn.release();
    }
  }

  // 5. ลบที่อยู่
  async deleteAddress(id: number): Promise<boolean> {
    const query = `DELETE FROM addresses WHERE id = ?`;
    
    const conn = await db.getConnection();
    try {
      const [result] = await conn.query<ResultSetHeader>(query, [id]);
      return result.affectedRows > 0;
    } catch (error) {
      console.error("Failed to delete address:", error);
      throw new Error("Failed to delete address");
    } finally {
      conn.release();
    }
  }

  // 6. ตั้งเป็นค่า Default (Method พิเศษ)
  async setDefaultAddress(id: number, userId: string): Promise<boolean> {
    const conn = await db.getConnection();
    try {
      // 1. เคลียร์ Default เก่าทั้งหมดของ User นี้
      await conn.query("UPDATE addresses SET is_default = 0 WHERE user_id = ?", [userId]);
      
      // 2. ตั้งอันใหม่เป็น Default
      const [result] = await conn.query<ResultSetHeader>(
        "UPDATE addresses SET is_default = 1, updated_at = NOW() WHERE id = ?", 
        [id]
      );
      
      return result.affectedRows > 0;
    } catch (error) {
      console.error("Failed to set default address:", error);
      throw new Error("Database error");
    } finally {
      conn.release();
    }
  }
}