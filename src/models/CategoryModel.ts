// src/models/CategoryModel.ts

export interface CategoryModel {
  id: number;
  parent_id: number | null;
  name: string;
  slug: string;
  image_url: string | null;
  is_active: number;
  created_at?: Date;
  updated_at?: Date;
  product_count?: number; // 👈 เพิ่มบรรทัดนี้เข้ามา
}

export interface CreateCategoryInput {
  parent_id?: number | null;
  name: string;
  slug?: string; // ถ้าไม่ส่งมา เดี๋ยวเรา Auto Gen จาก name เอา
  image_url?: string;
  is_active?: number;
}

export interface UpdateCategoryInput {
  parent_id?: number | null;
  name?: string;
  slug?: string;
  image_url?: string;
  is_active?: number;
}