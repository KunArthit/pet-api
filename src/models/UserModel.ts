export interface UserModel {
  id: string;
  username: string;
  email: string;
  password: string;
  role: string;
  phone: string;
  is_active: number;
  email_verified: number;
  email_verified_at: Date | null;
  created_at: Date;
  updated_at: Date;
}