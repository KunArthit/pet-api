export interface RefreshTokenModel {
  id: number; // int(11)
  user_id: string; // char(36)
  token: string; // varchar(500)
  expires_at: Date; // timestamp
  created_at?: Date; // timestamp
}
