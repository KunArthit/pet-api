export interface CartWishlistModel {
  id: number;
  user_id: string;
  product_id: number;
  quantity: number | null; // Wishlist อาจจะไม่มี quantity
  type: "cart" | "wishlist";
  created_at: Date;
  updated_at: Date;
}