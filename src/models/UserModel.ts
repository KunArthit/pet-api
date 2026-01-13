export interface UserModel {
  id: string;
  username: string;
  email: string;
  password: string;
  role:string;
  phone: string;
  is_active: number;
  created_at: Date;
  updated_at: Date;
}