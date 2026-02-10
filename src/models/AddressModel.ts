export interface AddressModel {
  id: number;
  user_id: string; // char(36)
  recipient_name: string;
  phone: string;
  address_line1: string;
  address_line2?: string | null;
  sub_district: string;
  district: string;
  province: string;
  zip_code: string;
  is_default: number; // tinyint(1) -> 0 or 1
  type: "shipping" | "billing"; // Enum
  created_at: Date;
  updated_at: Date;
}

// Type สำหรับรับค่าตอน Create (ตัด field ที่ auto-gen ออก)
export type CreateAddressInput = Omit<AddressModel, "id" | "created_at" | "updated_at">;

// Type สำหรับรับค่าตอน Update (Partial)
export type UpdateAddressInput = Partial<Omit<AddressModel, "id" | "user_id" | "created_at" | "updated_at">>;