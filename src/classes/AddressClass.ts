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
    const conn = await db.getConnection();
    try {
      // ✅ FIX: ถ้าตั้งเป็น Default (1) ต้องไปเคลียร์ของเก่า "เฉพาะ Type นั้นๆ"
      if (payload.is_default === 1) {
        await conn.query(
          `UPDATE addresses SET is_default = 0 WHERE user_id = ? AND type = ?`, // เพิ่ม AND type = ?
          [payload.user_id, payload.type]
        );
      }

      const query = `
        INSERT INTO addresses 
        (user_id, recipient_name, phone, address_line1, address_line2, sub_district, district, province, zip_code, is_default, type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      const [result] = await conn.execute<ResultSetHeader>(query, [
        payload.user_id,
        payload.recipient_name,
        payload.phone,
        payload.address_line1,
        payload.address_line2 || null,
        payload.sub_district,
        payload.district,
        payload.province,
        payload.zip_code,
        payload.is_default ?? 0,
        payload.type
      ]);

      return result.insertId;
    } finally {
      conn.release();
    }
  }

  // 2. ดึงข้อมูลตาม User ID
  async getAddressesByUserId(userId: string): Promise<AddressModel[]> {
    const [rows] = await db.execute<AddressModel[] & RowDataPacket[]>(
      `SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC`,
      [userId]
    );
    return rows;
  }

  // 3. ดึงข้อมูลตาม ID
  async getAddressById(id: number): Promise<AddressModel | null> {
    const [rows] = await db.execute<AddressModel[] & RowDataPacket[]>(
      `SELECT * FROM addresses WHERE id = ?`,
      [id]
    );
    return rows[0] || null;
  }

  // 4. แก้ไขที่อยู่
  async updateAddress(id: number, patch: UpdateAddressInput & { user_id?: string; }, updatePayload: { type: "shipping" | "billing" | undefined; recipient_name?: string | undefined; phone?: string | undefined; address_line1?: string | undefined; address_line2?: string | undefined; sub_district?: string | undefined; district?: string | undefined; province?: string | undefined; zip_code?: string | undefined; is_default?: number | undefined; }): Promise<boolean> {
    const { setSql, values } = this.buildUpdateSet(patch);
    if (!setSql) return false;

    const conn = await db.getConnection();
    try {
      // ✅ FIX: กรณีแก้ไขให้เป็น Default
      if (patch.is_default === 1 && patch.user_id) {
         // เราต้องรู้ Type ของ Address นี้ก่อน เพื่อจะไปเคลียร์ตัวอื่นใน Type เดียวกัน
         // 1. ถ้าส่ง type มาใน patch ก็ใช้เลย
         // 2. ถ้าไม่ส่ง ต้อง query หา type เดิมจาก DB
         let targetType = patch.type;
         
         if (!targetType) {
            const [current] = await conn.query<any[]>(`SELECT type FROM addresses WHERE id = ?`, [id]);
            if (current[0]) targetType = current[0].type;
         }

         if (targetType) {
             await conn.query(
                `UPDATE addresses SET is_default = 0 WHERE user_id = ? AND type = ? AND id != ?`, // เพิ่ม AND type = ?
                [patch.user_id, targetType, id]
            );
         }
      }

      const query = `UPDATE addresses SET ${setSql}, updated_at = NOW() WHERE id = ?`;
      const [result] = await conn.execute<ResultSetHeader>(query, [...values, id]);
      
      return result.affectedRows > 0;
    } finally {
      conn.release();
    }
  }

  // 5. ลบที่อยู่
  async deleteAddress(id: number): Promise<boolean> {
    const query = `DELETE FROM addresses WHERE id = ?`;
    const [result] = await db.execute<ResultSetHeader>(query, [id]);
    return result.affectedRows > 0;
  }

  // 6. ตั้งเป็นค่า Default (Method พิเศษ - กดปุ่มดาว)
  async setDefaultAddress(id: number, userId: string): Promise<boolean> {
    const conn = await db.getConnection();
    try {
      // 1. หา Type ของ ID ที่กำลังจะตั้งเป็น Default ก่อน
      const [rows] = await conn.query<any[]>(`SELECT type FROM addresses WHERE id = ?`, [id]);
      if (rows.length === 0) return false;
      
      const type = rows[0].type; // 'shipping' หรือ 'billing'

      // 2. ✅ FIX: เคลียร์ Default เก่า เฉพาะที่เป็น Type เดียวกัน
      await conn.query(
          "UPDATE addresses SET is_default = 0 WHERE user_id = ? AND type = ?", 
          [userId, type]
      );
      
      // 3. ตั้งอันใหม่เป็น Default
      const [result] = await conn.query<ResultSetHeader>(
        "UPDATE addresses SET is_default = 1, updated_at = NOW() WHERE id = ?", 
        [id]
      );
      return result.affectedRows > 0;
    } finally {
      conn.release();
    }
  }
}