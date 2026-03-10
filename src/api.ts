// src/api.ts
import { Elysia } from "elysia";
import UserController from "./controllers/UserController";
import ProductController from "./controllers/ProductController";
import AuthController from "./controllers/AuthController";
import VerifyController from "./controllers/VerifyController";
import AddressController from "./controllers/AddressController";
import CategoryController from "./controllers/CategoryController";
import { passwordController } from "./controllers/PasswordController";
import { lineWebhook } from "./controllers/lineWebhook";
import { uploadRoute } from "./upload";
import CartController from "./controllers/CartController";
import WishlistController from "./controllers/WishlistController";
import OrderController from "./controllers/OrderController";
import PaymentController from "./controllers/PymentController";

export const apiRouter = <T extends string>(config: { prefix: T }) => {
  const controllers = [
    UserController,
    AuthController,
    VerifyController,
    ProductController,
    CategoryController,
    passwordController,
    AddressController,
    CartController,
    WishlistController,
    OrderController,
    PaymentController
  ];

  const app = new Elysia({
    prefix: config.prefix,
    name: "api",
    seed: config,
  });

  // ✅ รวม controller ทั้งหมด
  controllers.forEach((controller) => {
    app.use(controller);
  });

  // ✅ เพิ่ม LINE webhook (แค่ครั้งเดียว)
  app.use(lineWebhook);

  app.use(uploadRoute);

  // ✅ Global error handler
  app.onError(({ code, error, set }) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`🔥 API Error [${code}]:`, message);
    set.status = code === "NOT_FOUND" ? 404 : 500;
    return {
      success: false,
      message: message || "Internal Server Error",
      code,
    };
  });

  return app;
};