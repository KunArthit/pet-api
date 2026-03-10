// src/models/QuotationModel.ts

export interface QuotationItemModel {
  id: number;
  quotation_id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  price: number;
  created_at: Date;
}

export interface QuotationModel {
  id: number;
  quotation_number: string;
  user_id: string;
  total_amount: number;
  status: "pending" | "approved" | "rejected" | "expired"; // ตาม ENUM
  valid_until: Date; // วันหมดอายุใบเสนอราคา
  company_name: string | null;
  tax_id: string | null;
  address: string; // ที่อยู่ออกใบเสนอราคา
  created_at: Date;
  updated_at: Date;
  
  items?: QuotationItemModel[];
}