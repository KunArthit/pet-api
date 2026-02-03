// api.ts
import { Elysia } from "elysia";
import UserController from "./controllers/UserController";
import AuthController from "./controllers/AuthController";
import VerifyController from "./controllers/VerifyController";

export const apiRouter = <T extends string>(config: { prefix: T }) => {
  const controllers = [UserController, AuthController, VerifyController];

  const app = new Elysia({
    prefix: config.prefix,
    name: "api",
    seed: config,
  });

  // ✅ รวม controller ทั้งหมด
  controllers.forEach((controller) => {
    app.use(controller);
  });

  // ✅ Global error handler — แก้ปัญหา JSON parse error
  app.onError(({ code, error, set }) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`🔥 API Error [${code}]:`, message);

    // กำหนดสถานะ (บาง code เช่น NOT_FOUND, VALIDATION ก็สามารถจัดการเฉพาะได้)
    set.status = code === "NOT_FOUND" ? 404 : 500;

    return {
      success: false,
      message: message || "Internal Server Error",
      code,
    };
  });

  return app;
};