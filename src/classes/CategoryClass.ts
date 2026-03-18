// src/classes/CategoryClass.ts
import type { ResultSetHeader } from "mysql2/promise";
import db from "../core/database";
import type { CategoryModel, CreateCategoryInput, UpdateCategoryInput } from "../models/CategoryModel";

export default class CategoryClass {
  
  /**
   * ดึงหมวดหมู่ทั้งหมด (เรียงตาม ID หรือตามต้องการ)
   */
 async getAllCategories(onlyActive: boolean): Promise<CategoryModel[]> {
    // 👇 แก้คำสั่ง SQL ให้ JOIN กับตาราง products แล้วนับ (COUNT)
    let query = `
      SELECT c.*, COUNT(p.id) AS product_count 
      FROM categories c
      LEFT JOIN products p ON c.id = p.category_id AND p.deleted_at IS NULL
    `;
    const params: any[] = [];

    console.log("Active: ",onlyActive);
    if (onlyActive) {
      console.log("Active: ",onlyActive);
      
      query += ` WHERE c.is_active = 1`;
    }
    
    // 👇 เพิ่ม GROUP BY เพื่อจัดกลุ่มการนับให้ถูกต้อง
    query += ` GROUP BY c.id ORDER BY c.parent_id ASC, c.id ASC`;

    const [rows] = await db.execute<any[]>(query, params);
    return rows as CategoryModel[];
  }

  /**
   * ดึงหมวดหมู่ตาม ID
   */
  async getCategoryById(id: number): Promise<CategoryModel | null> {
    const [rows] = await db.execute<any[]>(
      `SELECT * FROM categories WHERE id = ?`, 
      [id]
    );
    return (rows[0] as CategoryModel) || null;
  }

  /**
   * สร้างหมวดหมู่ใหม่
   */
  async createCategory(data: CreateCategoryInput): Promise<number> {
    // 1. ถ้าไม่ได้ส่ง slug มา ให้สร้างจาก name (ง่ายๆ)
    // เช่น name: "อาหาร แมว" -> slug: "อาหาร-แมว"
    const slug = data.slug || data.name.trim().toLowerCase().replace(/\s+/g, '-');

    const query = `
      INSERT INTO categories (parent_id, name, slug, image_url, is_active)
      VALUES (?, ?, ?, ?, ?)
    `;
    
    const [result] = await db.execute<ResultSetHeader>(query, [
      data.parent_id || null, // ถ้าไม่ส่งมาให้เป็น null
      data.name,
      slug,
      data.image_url || null,
      data.is_active ?? 1 // default เป็น 1 (Active)
    ]);

    return result.insertId;
  }

  /**
   * อัปเดตหมวดหมู่
   */
  async updateCategory(id: number, data: UpdateCategoryInput): Promise<boolean> {
    const fields: string[] = [];
    const values: any[] = [];

    if (data.parent_id !== undefined) { fields.push("parent_id = ?"); values.push(data.parent_id); }
    if (data.name !== undefined) { fields.push("name = ?"); values.push(data.name); }
    if (data.slug !== undefined) { fields.push("slug = ?"); values.push(data.slug); }
    if (data.image_url !== undefined) { fields.push("image_url = ?"); values.push(data.image_url); }
    if (data.is_active !== undefined) { fields.push("is_active = ?"); values.push(data.is_active); }

    if (fields.length === 0) return false;

    fields.push("updated_at = NOW()");
    
    const query = `UPDATE categories SET ${fields.join(", ")} WHERE id = ?`;
    values.push(id);

    const [result] = await db.execute<ResultSetHeader>(query, values);
    return result.affectedRows > 0;
  }

  /**
   * ลบหมวดหมู่ (ในรูปไม่มี deleted_at ดังนั้นจะเป็น Hard Delete คือลบจริง)
   * หมายเหตุ: ถ้าจะลบ ต้องระวังสินค้าที่ผูกอยู่กับหมวดหมู่นี้ด้วย
   */
  async deleteCategory(id: number): Promise<{ success: boolean; message: string }> {
    const conn = await db.getConnection();
    try {
      // 1. เช็คก่อนว่ามีหมวดหมู่ลูก (Sub-categories) ผูกอยู่ไหม?
      const [childCats] = await conn.query<any[]>(
        `SELECT id FROM categories WHERE parent_id = ? LIMIT 1`, 
        [id]
      );
      if (childCats.length > 0) {
        return { success: false, message: "ไม่สามารถลบได้ เนื่องจากมีหมวดหมู่ย่อยผูกอยู่" };
      }

      // 2. เช็คก่อนว่ามีสินค้า (Products) ผูกอยู่ในหมวดหมู่นี้ไหม?
      const [products] = await conn.query<any[]>(
        `SELECT id FROM products WHERE category_id = ? AND deleted_at IS NULL LIMIT 1`, 
        [id]
      );
      if (products.length > 0) {
        return { success: false, message: "ไม่สามารถลบได้ เนื่องจากมีสินค้าอยู่ในหมวดหมู่นี้" };
      }

      // 3. ถ้าเคลียร์หมดแล้ว ลบทิ้งได้เลย (Hard Delete ได้ เพราะเป็นแค่ Master Data)
      const [result] = await conn.query<ResultSetHeader>(
        `DELETE FROM categories WHERE id = ?`, 
        [id]
      );
      
      if (result.affectedRows > 0) {
        return { success: true, message: "ลบหมวดหมู่สำเร็จ" };
      } else {
        return { success: false, message: "ไม่พบหมวดหมู่นี้ในระบบ" };
      }
    } catch (error) {
      console.error("Delete Category Error:", error);
      throw error;
    } finally {
      conn.release();
    }
  }
}