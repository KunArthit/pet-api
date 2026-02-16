// src/controllers/lineWebhook.ts
import { Elysia } from "elysia";

interface LineWebhookBody {
  events?: Array<{ source?: { userId?: string } }>;
}

export const lineWebhook = new Elysia({ prefix: "/line" }).post(
  "/webhook",
  async ({ body }) => {
    const b = body as LineWebhookBody;
    console.log("📩 LINE Webhook Event:");
    console.log(JSON.stringify(body, null, 2));

    // ✅ ดึง userId ถ้ามีใน event
    if (b?.events?.[0]?.source?.userId) {
      console.log("✅ userId ของคุณคือ:", b.events[0].source.userId);
    }

    return "OK";
  }
);