import { ProductImagesModel } from "../models/ProductImagesModel";
import db from "../core/database";

class ProductImageService {
  // ดึงรูปภาพตาม Product ID
  async getImagesByProductId(product_id: number): Promise<ProductImagesModel[]> {
    // แก้ไข: ใช้ sort_order ตาม Schema จริง
    const query = `SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order ASC;`;
    const conn = await db.getConnection();
    try {
      const [rows] = await conn.query(query, [product_id]);
      return rows as ProductImagesModel[];
    } catch (error) {
      console.error("Failed to fetch product images:", error);
      throw error;
    } finally {
      conn.release();
    }
  }

  // สร้างรูปภาพใหม่
  async createImage(image: { product_id: number; image_url: string; sort_order: number }): Promise<number> {
    // แก้ไข: VALUES มี 3 ตัวให้ตรงกับ Parameter (id และ created_at ให้ DB จัดการ)
    const query = `
      INSERT INTO product_images (product_id, image_url, sort_order)
      VALUES (?, ?, ?);
    `;
    const conn = await db.getConnection();
    try {
      const [result]: any = await conn.query(query, [
        image.product_id,
        image.image_url,
        image.sort_order,
      ]);
      return result.insertId;
    } catch (error) {
      console.error("Database Insert Error:", error);
      throw error;
    } finally {
      conn.release();
    }
  }

  async deleteImage(id: number): Promise<boolean> {
    const query = `DELETE FROM product_images WHERE id = ?;`;
    const conn = await db.getConnection();
    try {
      const [result]: any = await conn.query(query, [id]);
      return result.affectedRows > 0;
    } finally {
      conn.release();
    }
  }
}

export default new ProductImageService();