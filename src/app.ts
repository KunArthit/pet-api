// src/app.ts
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { apiRouter } from "./api";
import { cors } from "@elysiajs/cors";
import { staticPlugin } from "@elysiajs/static";

export const app = new Elysia()
  .onRequest(({ request }) => {
    console.log(
      `Incoming Request: ${request.method} ${new URL(request.url).pathname}`,
    );
  })

  .use(
    cors({
      origin: ["http://localhost:5173", "http://3.27.64.101"],
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  )

  .use(staticPlugin({ prefix: "/uploads", assets: "uploads" }))

  .get("/", () => ({ message: "Welcome to Elysia API" }))
  .get("/health", () => ({ status: "ok" }))

  .use(
    staticPlugin({
      prefix: "/uploads",
      assets: "uploads",
    })
  )

  .use(apiRouter({ prefix: "/api" }))

  .use(
    swagger({
      path: "/docs",
      documentation: {
        info: {
          title: "Elysia API Documentation",
          version: "1.0.0",
        },
        tags: [
          { name: "Users", description: "User Management Endpoints" },
          { name: "Products", description: "Product Management Endpoints" },
          { name: "Uploads", description: "File Upload Endpoints" },
        ],
      },
    }),
  );