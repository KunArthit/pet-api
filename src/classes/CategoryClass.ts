// src/classes/CategoryClass.ts
import type { ResultSetHeader } from "mysql2/promise";
import db from "../core/database";
import type { CategoryModel, CreateCategoryInput, UpdateCategoryInput } from "../models/CategoryModel";

export default class CategoryClass {
  
  /**
   * ดึงหมวดหมู่ทั้งหมด (เรียงตาม ID หรือตามต้องการ)
   */
  async getAllCategories(onlyActive: boolean = true): Promise<CategoryModel[]> {
    let query = `SELECT * FROM categories`;
    const params: any[] = [];

    if (onlyActive) {
      query += ` WHERE is_active = 1`;
    }
    
    query += ` ORDER BY parent_id ASC, id ASC`; // เรียงพ่อมาก่อนลูก

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
  async deleteCategory(id: number): Promise<boolean> {
    // อาจจะต้องเช็คก่อนว่ามีสินค้าใช้อยู่ไหม (ถ้าจะทำละเอียด)
    // แต่นี่เอาแบบลบเลย
    const query = `DELETE FROM categories WHERE id = ?`;
    const [result] = await db.execute<ResultSetHeader>(query, [id]);
    return result.affectedRows > 0;
  }
}