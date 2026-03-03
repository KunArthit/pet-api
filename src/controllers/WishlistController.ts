import { Elysia, t } from "elysia";
import CartWishlistClass from "../classes/CartWishlistClass";
import { AuthGuardClass } from "../classes/AuthGuardClass";
import { jwtPlugin } from "../utils/jwt-plugin";

const Service = new CartWishlistClass();
const AuthGuard = new AuthGuardClass();

const wishlistController = new Elysia({
  prefix: "/wishlists",
  tags: ["Wishlist"],
})
  .use(jwtPlugin)

  // 💖 1. ดูรายการโปรด
  .get("/", async ({ request, jwt, set }) => {
    const user = await AuthGuard.validate(request, jwt);
    if (!user) {
      set.status = 401;
      return { success: false, message: "Unauthorized" };
    }

    const items = await Service.getItems(user.id, "wishlist");
    return { success: true, data: items };
  })

  // 💖 2. เพิ่มลงรายการโปรด
  .post(
    "/",
    async ({ body, request, jwt, set }) => {
      const user = await AuthGuard.validate(request, jwt);
      if (!user) {
        set.status = 401;
        return { success: false, message: "Unauthorized" };
      }

      const ok = await Service.addItem(user.id, body.product_id, 1, "wishlist");
      if (!ok) {
        set.status = 500;
        return { success: false, message: "Failed to add to wishlist" };
      }

      return { success: true, message: "Added to wishlist" };
    },
    {
      body: t.Object({ product_id: t.Number() }),
    },
  )

  // 💖 3. ลบออกจากรายการโปรด
  .delete(
    "/:id",
    async ({ params, request, jwt, set }) => {
      const user = await AuthGuard.validate(request, jwt);
      if (!user) {
        set.status = 401;
        return { success: false, message: "Unauthorized" };
      }

      const ok = await Service.removeItem(Number(params.id), user.id);
      return { success: ok, message: ok ? "Item removed" : "Failed to remove" };
    },
    {
      params: t.Object({ id: t.String() }),
    },
  );

export default wishlistController;
