// src/classes/ProductClass.ts
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import db from "../core/database";

export default class ProductClass {
  // ==========================================
  // 🟢 1. ดึงสินค้าทั้งหมด (ลบเงื่อนไข deleted_at ออก)
  // ==========================================
  async getAllProducts(options: { limit?: number; offset?: number; search?: string; categoryId?: number; } = {}) {
    const limit = parseInt(String(options.limit || 20), 10);
    const offset = parseInt(String(options.offset || 0), 10);

    let query = `SELECT * FROM products WHERE 1=1`;
    const params: any[] = [];

    if (options.search) {
      query += ` AND (name LIKE ? OR sku LIKE ?)`;
      params.push(`%${options.search}%`, `%${options.search}%`);
    }

    if (options.categoryId && !isNaN(Number(options.categoryId))) {
      query += ` AND category_id = ?`;
      params.push(Number(options.categoryId));
    }

    query += ` ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;

    const conn = await db.getConnection();
    try {
      const [rows] = await conn.query<RowDataPacket[]>(query, params);
      return rows;
    } finally {
      conn.release();
    }
  }

  // ==========================================
  // 🟢 2. ดึงรายละเอียดสินค้าตาม ID
  // ==========================================
  async getProductById(id: number) {
    const conn = await db.getConnection();
    try {
      const [rows] = await conn.query<RowDataPacket[]>(`SELECT * FROM products WHERE id = ?`, [id]);
      if (rows.length === 0) return null;
      return rows[0];
    } finally {
      conn.release();
    }
  }

  // ==========================================
  // 🟢 3. สร้างสินค้าใหม่
  // ==========================================
  async createProduct(data: any): Promise<number> {
    const conn = await db.getConnection();
    try {
      const query = `
        INSERT INTO products 
        (category_id, name, slug, sku, description, price, stock_quantity, image_url, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const [result] = await conn.query<ResultSetHeader>(query, [
        data.category_id || null,
        data.name,
        data.slug,
        data.sku || null,
        data.description || null,
        data.price,
        data.stock_quantity || 0,
        data.image_url || null,
        data.is_active ?? 1,
      ]);
      return result.insertId;
    } finally {
      conn.release();
    }
  }

  // ==========================================
  // 🟢 4. อัปเดตสินค้า
  // ==========================================
  async updateProduct(id: number, data: any): Promise<boolean> {
    const fields: string[] = [];
    const values: any[] = [];

    const allowedFields = ["name", "slug", "sku", "description", "price", "stock_quantity", "image_url", "is_active", "category_id"];
    
    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(data[field]);
      }
    }

    if (fields.length === 0) return false;
    fields.push("updated_at = NOW()");

    const query = `UPDATE products SET ${fields.join(", ")} WHERE id = ?`;
    values.push(id);

    const conn = await db.getConnection();
    try {
      const [result] = await conn.query<ResultSetHeader>(query, values);
      return result.affectedRows > 0;
    } finally {
      conn.release();
    }
  }

  // ==========================================
  // 💀 5. ลบสินค้า (Hard Delete) ส่ง URL Gallery กลับไปให้ Controller ลบไฟล์
  // ==========================================
  async deleteProduct(id: number): Promise<{ success: boolean; galleryUrls: string[] }> {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // 1. ดึง URL รูปแกลเลอรีทั้งหมดออกมาก่อน
      const [images] = await conn.query<RowDataPacket[]>(
        `SELECT image_url FROM product_images WHERE product_id = ?`, [id]
      );
      const galleryUrls = images.map(img => img.image_url);

      // 2. ลบออกจาก DB
      await conn.query(`DELETE FROM product_images WHERE product_id = ?`, [id]);
      const [result] = await conn.query<ResultSetHeader>(`DELETE FROM products WHERE id = ?`, [id]);

      await conn.commit();
      return { success: result.affectedRows > 0, galleryUrls };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }
}