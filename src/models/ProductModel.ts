import type { RowDataPacket } from "mysql2/promise";

// 1. Interface สำหรับตาราง products
export interface ProductModel extends RowDataPacket {
  id: number;
  category_id: number | null;
  name: string;
  slug: string;
  sku: string | null;
  description: string | null;
  price: number; // หรือ string ถ้า mysql driver คืนค่า decimal เป็น string
  stock_quantity: number;
  image_url: string | null; // รูปหลัก
  is_active: number; // 0 หรือ 1
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// 2. Interface สำหรับตาราง product_images
export interface ProductImageModel extends RowDataPacket {
  id: number;
  product_id: number;
  image_url: string;
  sort_order: number;
  created_at: Date;
}

// Type สำหรับการสร้าง Product (ตัด field ที่ DB เจนเองออก)
export type CreateProductInput = Omit<
  ProductModel,
  "id" | "created_at" | "updated_at" | "deleted_at"
> & {
  gallery_images?: string[]; // รับ array ของ url รูปเพิ่มเติมมาพร้อมกันได้เลย
};

// Type สำหรับการแก้ไข Product
export type UpdateProductInput = Partial<CreateProductInput>;