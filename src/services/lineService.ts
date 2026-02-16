// src/services/lineService.ts
import "dotenv/config";
import fetch from "node-fetch";

const LINE_API_URL = "https://api.line.me/v2/bot/message/push";
const ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const ADMIN_USER_ID = process.env.ADMIN_USER_ID; // จาก LINE Developers

export async function sendLineNotification(message: string) {
  if (!ACCESS_TOKEN) {
    console.error("❌ LINE_ACCESS_TOKEN is missing");
    return;
  }

  try {
    const res = await fetch(LINE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        to: ADMIN_USER_ID,
        messages: [{ type: "text", text: message }],
      }),
    });

    console.log("✅ Sent LINE message:", res.status);
  } catch (err) {
    console.error("❌ LINE Notify error:", err);
  }
}