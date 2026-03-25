// src/classes/ProductImagesClass.ts
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import db from "../core/database";

export default class ProductImagesClass {
  async getImagesByProductId(productId: number) {
    const conn = await db.getConnection();
    try {
      const [images] = await conn.query<RowDataPacket[]>(
        `SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order ASC`,
        [productId]
      );
      return images;
    } finally {
      conn.release();
    }
  }

  async createImage(data: { product_id: number; image_url: string; sort_order: number }): Promise<number> {
    const conn = await db.getConnection();
    try {
      const query = `INSERT INTO product_images (product_id, image_url, sort_order) VALUES (?, ?, ?)`;
      const [result] = await conn.query<ResultSetHeader>(query, [data.product_id, data.image_url, data.sort_order]);
      return result.insertId;
    } finally {
      conn.release();
    }
  }

  // 💀 ลบรูปแกลเลอรีเดี่ยวๆ (คืนค่า URL กลับไปให้ลบไฟล์จริง)
  async deleteImage(imageId: number): Promise<string | null> {
    const conn = await db.getConnection();
    try {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT image_url FROM product_images WHERE id = ?`, [imageId]
      );
      if (rows.length === 0) return null;

      await conn.query(`DELETE FROM product_images WHERE id = ?`, [imageId]);
      return rows[0].image_url;
    } finally {
      conn.release();
    }
  }
}