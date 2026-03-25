// src/app.ts
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { apiRouter } from "./api";
import { cors } from "@elysiajs/cors";
import { consentRoute } from "./routes/consent";
import staticPlugin from "@elysiajs/static"; // ✅ default export สำหรับ static plugin

export const app = new Elysia()
  // 🧭 Log requests
  .onRequest(({ request }) => {
    console.log(
      `Incoming Request: ${request.method} ${new URL(request.url).pathname}`,
    );
  })

  // 🌐 CORS
  .use(
    cors({
      origin: ["http://localhost:5173", "http://3.27.64.101:3000"],
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  )

  // 🖼️ Static files (Uploads)
  .use(
    staticPlugin({
      prefix: "/uploads",
      assets: "/app/uploads",
      noCache: true, // ✅ ปิด cache เพื่อเห็นไฟล์ใหม่ทันที
    } as any)
  )

  // 🧩 Fallback route — โหลดไฟล์ใหม่สดจาก disk
  .get("/uploads/:filename", async ({ params, set }) => {
    const filePath = `/app/uploads/${params.filename}`;
    console.log("Serving dynamic file:", filePath);
    const f = Bun.file(filePath);
    if (!(await f.exists())) {
      set.status = 404;
      return { message: "File not found" };
    }
    return f;
  })

  // 🌍 Base routes
  .get("/", () => ({ message: "Welcome to Elysia API" }))
  .get("/health", () => ({ status: "ok" }))

  // 🔌 API router
  .use(apiRouter({ prefix: "/api" }))
  .use(consentRoute)

  // 📜 Swagger documentation
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