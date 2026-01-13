export interface ActivityLogModel {
  id: number;           // DB เป็น int(11)
  user_id: string;      // DB เป็น char(36)
  action: string;
  entity_type?: string; // varchar(50)
  entity_id?: string;   // varchar(50)
  details?: string;     // DB ชื่อ details (มี s) และเป็น longtext
  ip_address?: string;
  user_agent?: string;  // แก้จาก number เป็น string
  created_at?: Date;
}

// สร้าง Type สำหรับรับค่าเข้ามาบันทึก (ตัด id, created_at ออก)
export interface CreateActivityLogInput {
  user_id: string | null; // ยอมให้ null เผื่อ System log
  action: string;
  entity_type?: string;
  entity_id?: string;
  details?: string | object; // รับ object ได้ เดี๋ยวแปลงเป็น string ให้ใน class
  ip_address?: string;
  user_agent?: string;
}