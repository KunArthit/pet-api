process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { apiRouter } from "./api";
import { cors } from "@elysiajs/cors";

export const app = new Elysia()
  // Log all incoming requests
  .onRequest(({ request }) => {
    console.log(
      `Incoming Request: ${request.method} ${new URL(request.url).pathname}`,
    );
  })

  .use(
    cors({
      // ⚠️ ต้องระบุ origin ให้ชัดเจน (ห้ามใช้ *)
      origin: ["http://localhost:5173", "http://3.27.64.101"], // URL ของ Frontend React
      credentials: true, // อนุญาตให้ส่ง Cookie
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  )

  // Root & health
  .get("/", () => ({ message: "Welcome to Elysia API" }))
  .get("/health", () => ({ status: "ok" }))

  // API routes
  .use(apiRouter({ prefix: "/api" }))

  // Swagger documentation
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
        ],
      },
    }),
  );
