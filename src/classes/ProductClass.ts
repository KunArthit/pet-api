import type { ResultSetHeader } from "mysql2/promise";
import db from "../core/database";
import type {
  ProductModel,
  ProductImageModel,
  CreateProductInput,
  UpdateProductInput,
} from "../models/ProductModel";

export default class ProductClass {
  /**
   * ดึงสินค้าทั้งหมด (รองรับ Filter เบื้องต้น)
   * แก้ไข: ใช้ String Interpolation กับ LIMIT/OFFSET เพื่อแก้ปัญหา Mysql2 Error
   */
  async getAllProducts(
    options: {
      limit?: number;
      offset?: number;
      search?: string;
      categoryId?: number;
    } = {}
  ): Promise<ProductModel[]> {
    // 1. แปลงเป็นตัวเลขให้ชัวร์ก่อน (ถ้าแปลงไม่ได้ หรือเป็น NaN ให้ใช้ค่า Default)
    const limit = parseInt(String(options.limit || 20), 10);
    const offset = parseInt(String(options.offset || 0), 10);

    let query = `
      SELECT * FROM products 
      WHERE deleted_at IS NULL 
    `;
    const params: any[] = [];

    // Filter by Search
    if (options.search) {
      query += ` AND (name LIKE ? OR sku LIKE ?)`;
      // ใส่ % รอบคำค้นหา
      params.push(`%${options.search}%`, `%${options.search}%`);
    }

    // Filter by Category
    // 2. เช็คว่าต้องเป็นตัวเลขและมากกว่า 0
    if (options.categoryId && !isNaN(Number(options.categoryId))) {
      query += ` AND category_id = ?`;
      params.push(Number(options.categoryId));
    }

    // ✅ 3. แก้ไขจุดสำคัญ: ฝังตัวเลขลงไปใน SQL String เลย (ไม่ใช้ ?)
    // เพื่อแก้ปัญหา "Incorrect arguments to mysqld_stmt_execute"
    query += ` ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;

    try {
      const [rows] = await db.execute<ProductModel[]>(query, params);
      return rows;
    } catch (error) {
      console.error("Database Error:", error);
      throw error;
    }
  }

  /**
   * ดึงสินค้าตาม ID พร้อมรูป Gallery
   */
  async getProductById(
    id: number
  ): Promise<{ product: ProductModel; images: ProductImageModel[] } | null> {
    // 1. ดึงตัวสินค้า
    const [rows] = await db.execute<ProductModel[]>(
      `SELECT * FROM products WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );

    if (rows.length === 0) return null;

    // 2. ดึงรูป Gallery
    const [images] = await db.execute<ProductImageModel[]>(
      `SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order ASC`,
      [id]
    );

    return {
      product: rows[0],
      images: images,
    };
  }

  /**
   * สร้างสินค้าใหม่
   */
  async createProduct(data: CreateProductInput): Promise<number> {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // 1. Insert Product
      const query = `
        INSERT INTO products 
        (category_id, name, slug, sku, description, price, stock_quantity, image_url, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const [result] = await conn.execute<ResultSetHeader>(query, [
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

      const newProductId = result.insertId;

      // 2. Insert Gallery Images (ถ้ามี)
      if (data.gallery_images && data.gallery_images.length > 0) {
        const imageValues = data.gallery_images.map((url, index) => [
          newProductId,
          url,
          index, // sort_order
        ]);

        for (const [pId, url, order] of imageValues) {
            await conn.execute(
                `INSERT INTO product_images (product_id, image_url, sort_order) VALUES (?, ?, ?)`,
                [pId, url, order]
            );
        }
      }

      await conn.commit();
      return newProductId;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  /**
   * อัปเดตสินค้า
   */
  async updateProduct(id: number, data: UpdateProductInput): Promise<boolean> {
    // สร้าง Dynamic Query Update
    const fields: string[] = [];
    const values: any[] = [];

    if (data.name !== undefined) { fields.push("name = ?"); values.push(data.name); }
    if (data.slug !== undefined) { fields.push("slug = ?"); values.push(data.slug); }
    if (data.sku !== undefined) { fields.push("sku = ?"); values.push(data.sku); }
    if (data.description !== undefined) { fields.push("description = ?"); values.push(data.description); }
    if (data.price !== undefined) { fields.push("price = ?"); values.push(data.price); }
    if (data.stock_quantity !== undefined) { fields.push("stock_quantity = ?"); values.push(data.stock_quantity); }
    if (data.image_url !== undefined) { fields.push("image_url = ?"); values.push(data.image_url); }
    if (data.is_active !== undefined) { fields.push("is_active = ?"); values.push(data.is_active); }
    if (data.category_id !== undefined) { fields.push("category_id = ?"); values.push(data.category_id); }

    if (fields.length === 0) return false;

    // อัปเดต updated_at เสมอ
    fields.push("updated_at = NOW()");

    const query = `UPDATE products SET ${fields.join(", ")} WHERE id = ?`;
    values.push(id);

    const [result] = await db.execute<ResultSetHeader>(query, values);
    return result.affectedRows > 0;
  }

  /**
   * ลบสินค้า (Soft Delete)
   */
  async deleteProduct(id: number): Promise<boolean> {
    const query = `UPDATE products SET deleted_at = NOW() WHERE id = ?`;
    const [result] = await db.execute<ResultSetHeader>(query, [id]);
    return result.affectedRows > 0;
  }

  // --- จัดการรูปภาพ Gallery แยกต่างหาก ---

  /**
   * เพิ่มรูปเข้า Gallery ทีหลัง
   */
  async addProductImage(productId: number, imageUrl: string, sortOrder: number = 0): Promise<boolean> {
      const query = `INSERT INTO product_images (product_id, image_url, sort_order) VALUES (?, ?, ?)`;
      const [result] = await db.execute<ResultSetHeader>(query, [productId, imageUrl, sortOrder]);
      return result.affectedRows > 0;
  }

  /**
   * ลบรูปออกจาก Gallery (Hard Delete เพราะเป็นแค่รูปย่อย)
   */
  async deleteProductImage(imageId: number): Promise<boolean> {
      const query = `DELETE FROM product_images WHERE id = ?`;
      const [result] = await db.execute<ResultSetHeader>(query, [imageId]);
      return result.affectedRows > 0;
  }
}