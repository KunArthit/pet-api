// api.ts
import { Elysia } from "elysia";
import wpUserController from "./controllers/UserController";

export const apiRouter = <T extends string>(config: { prefix: T }) => {
  const controllers = [
    wpUserController
  ];

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
