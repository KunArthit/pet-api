// src/models/CategoryModel.ts

export interface CategoryModel {
  id: number;
  parent_id: number | null; // เป็น null ได้ ถ้าเป็นหมวดหมู่หลัก
  name: string;
  slug: string;
  image_url: string | null;
  is_active: number; // 0 หรือ 1
  created_at?: Date;
  updated_at?: Date;
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