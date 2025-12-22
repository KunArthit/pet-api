export interface UserModel {
  user_id: number;
  username: string;
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  phone: string;
  user_type_id: number;
  department_id: number;
  company_name: string;
  tax_id: string;
  is_active: number;
  created_at: Date;
  updated_at: Date;
}