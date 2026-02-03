// api.ts
import { Elysia } from "elysia";
import UserController from "./controllers/UserController";
import ProductController from "./controllers/ProductController";
import AuthController from "./controllers/AuthController";

export const apiRouter = <T extends string>(config: { prefix: T }) => {
  const controllers = [UserController, AuthController, ProductController];

  const app = new Elysia({
    prefix: config.prefix,
    name: "api",
    seed: config,
  });

  controllers.forEach((controller) => {
    app.use(controller);
  });

  return app;
};
