import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import db from "../core/database";
import type { CartWishlistModel } from "../models/CartWishlistModel";

export default class CartWishlistClass {
  
  // 1. ดึงข้อมูล (แยกตามประเภท cart หรือ wishlist)
  async getItems(userId: string, type: "cart" | "wishlist"): Promise<CartWishlistModel[]> {
    // 💡 แนะนำให้ JOIN กับตาราง products เพื่อเอาชื่อ, รูป, ราคา ไปแสดงผลด้วยเลย
    const query = `
      SELECT cw.*, p.name AS product_name, p.price AS product_price, p.image_url, p.stock_quantity
      FROM cart_wishlist cw
      LEFT JOIN products p ON cw.product_id = p.id
      WHERE cw.user_id = ? AND cw.type = ?
      ORDER BY cw.created_at DESC
    `;
    const conn = await db.getConnection();
    try {
      const [rows] = await conn.query<RowDataPacket[]>(query, [userId, type]);
      console.log(rows);
      
      return rows as CartWishlistModel[];
    } catch (error) {
      console.error(`Failed to fetch ${type}:`, error);
      return [];
    } finally {
      conn.release();
    }
  }

  // 2. เพิ่มสินค้า (มี Logic จัดการของซ้ำ)
  async addItem(userId: string, productId: number, quantity: number, type: "cart" | "wishlist"): Promise<boolean> {
    const conn = await db.getConnection();
    try {
      // เช็คก่อนว่ามีสินค้านี้ในระบบ (cart หรือ wishlist) อยู่แล้วไหม
      const checkQuery = `SELECT id, quantity FROM cart_wishlist WHERE user_id = ? AND product_id = ? AND type = ? LIMIT 1`;
      const [existing] = await conn.query<RowDataPacket[]>(checkQuery, [userId, productId, type]);

      if (existing.length > 0) {
        if (type === "cart") {
          // ถ้าเป็น Cart -> ให้บวกจำนวนเพิ่ม
          const newQty = existing[0].quantity + quantity;
          await conn.query(`UPDATE cart_wishlist SET quantity = ?, updated_at = NOW() WHERE id = ?`, [newQty, existing[0].id]);
          return true;
        } else {
          // ถ้าเป็น Wishlist -> มีอยู่แล้ว ไม่ต้องทำอะไร (หรือจะ return false ก็ได้)
          return true;
        }
      } else {
        // ถ้ายังไม่มี -> Insert ใหม่
        const insertQuery = `
          INSERT INTO cart_wishlist (user_id, product_id, quantity, type, created_at, updated_at) 
          VALUES (?, ?, ?, ?, NOW(), NOW())
        `;
        const [result] = await conn.query<ResultSetHeader>(insertQuery, [
          userId, 
          productId, 
          type === "wishlist" ? 0 : quantity, // wishlist ไม่จำเป็นต้องมี qty
          type
        ]);
        return result.affectedRows > 0;
      }
    } catch (error) {
      console.error(`Failed to add to ${type}:`, error);
      throw new Error("Database error");
    } finally {
      conn.release();
    }
  }

  // 3. อัปเดตจำนวนสินค้า (เฉพาะ Cart)
  async updateQuantity(id: number, userId: string, quantity: number): Promise<boolean> {
    const query = `UPDATE cart_wishlist SET quantity = ?, updated_at = NOW() WHERE id = ? AND user_id = ? AND type = 'cart'`;
    const conn = await db.getConnection();
    try {
      const [result] = await conn.query<ResultSetHeader>(query, [quantity, id, userId]);
      return result.affectedRows > 0;
    } catch (error) {
      console.error("Failed to update quantity:", error);
      return false;
    } finally {
      conn.release();
    }
  }

  // 4. ลบสินค้าออก
  async removeItem(id: number, userId: string): Promise<boolean> {
    const query = `DELETE FROM cart_wishlist WHERE id = ? AND user_id = ?`;
    const conn = await db.getConnection();
    try {
      const [result] = await conn.query<ResultSetHeader>(query, [id, userId]);
      return result.affectedRows > 0;
    } catch (error) {
      console.error("Failed to remove item:", error);
      return false;
    } finally {
      conn.release();
    }
  }
}