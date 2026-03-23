// src/models/OrderModel.ts

export interface OrderItemModel {
  id: number;
  order_id: number;
  product_id: number;
  product_name: string;
  product_sku: string | null;
  product_image: string | null;
  quantity: number;
  price: number; // ราคา ณ ตอนที่ซื้อ (Decimal 10,2 ใน DB ควรรับเป็น number)
}

export interface OrderModel {
  id: number;
  order_number: string;
  user_id: string; // char(36) UUID
  total_amount: number;
  shipping_cost: number;
  // เพิ่ม/ลด Status ตาม ENUM จริงที่คุณตั้งไว้ใน Database ได้เลยครับ
  status: "pending" | "paid" | "shipped" | "delivered" | "cancelled" | "refunded";
  payment_method: string;
  shipping_name: string;
  shipping_address: string;
  shipping_phone: string;
  billing_name: string;
  billing_address: string;
  billing_phone: string;
  tracking_number: string | null;
  cancel_reason: string | null;
  created_at: Date;
  updated_at: Date;
  
  // 💡 Optional: เอาไว้รับข้อมูลเวลาเรา JOIN ตาราง order_items มาแสดงผล
  items?: OrderItemModel[]; 
}

// Type สำหรับรับค่าตอนสร้าง Order จาก Controller
export interface CreateOrderInput {
  shipping_address_id: number;
  billing_address_id: number;
  shipping_cost?: number;
  payment_method?: string;
}