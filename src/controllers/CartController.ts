import { Elysia, t } from "elysia";
import CartWishlistClass from "../classes/CartWishlistClass";
import { AuthGuardClass } from "../classes/AuthGuardClass";
import { jwtPlugin } from "../utils/jwt-plugin";

const Service = new CartWishlistClass();
const AuthGuard = new AuthGuardClass();

const cartController = new Elysia({ prefix: "/carts", tags: ["Cart"] })
  .use(jwtPlugin)

  // 🛒 1. ดูตะกร้าสินค้า
  .get("/", async ({ request, jwt, set }) => {
    const user = await AuthGuard.validate(request, jwt);
    if (!user) { set.status = 401; return { success: false, message: "Unauthorized" }; }

    const items = await Service.getItems(user.id, "cart");
    return { success: true, data: items };
  })

  // 🛒 2. เพิ่มลงตะกร้า
  .post("/", async ({ body, request, jwt, set }) => {
    const user = await AuthGuard.validate(request, jwt);
    if (!user) { set.status = 401; return { success: false, message: "Unauthorized" }; }

    const ok = await Service.addItem(user.id, body.product_id, body.quantity, "cart");
    if (!ok) { set.status = 500; return { success: false, message: "Failed to add to cart" }; }

    return { success: true, message: "Added to cart" };
  }, {
    body: t.Object({ product_id: t.Number(), quantity: t.Number({ minimum: 1 }) })
  })

  // 🛒 3. อัปเดตจำนวนสินค้า
  .patch("/:id/quantity", async ({ params, body, request, jwt, set }) => {
    const user = await AuthGuard.validate(request, jwt);
    if (!user) { set.status = 401; return { success: false, message: "Unauthorized" }; }

    const ok = await Service.updateQuantity(Number(params.id), user.id, body.quantity);
    if (!ok) { set.status = 400; return { success: false, message: "Item not found or update failed" }; }

    return { success: true, message: "Quantity updated" };
  }, {
    params: t.Object({ id: t.String() }),
    body: t.Object({ quantity: t.Number({ minimum: 1 }) })
  })

  // 🛒 4. ลบออกจากตะกร้า
  .delete("/:id", async ({ params, request, jwt, set }) => {
    const user = await AuthGuard.validate(request, jwt);
    if (!user) { set.status = 401; return { success: false, message: "Unauthorized" }; }

    const ok = await Service.removeItem(Number(params.id), user.id);
    return { success: ok, message: ok ? "Item removed" : "Failed to remove" };
  }, {
    params: t.Object({ id: t.String() })
  });

export default cartController;