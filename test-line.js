import "dotenv/config";
import fetch from "node-fetch";

const ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const USER_ID = process.env.ADMIN_USER_ID;

async function testLineMessage() {
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      to: USER_ID,
      messages: [
        { type: "text", text: "ไอ่เหี้ย ไอ่สัส มึงทำเพื่ออะไร ดับเบิ้ลหี" },
      ],
    }),
  });

  console.log("สถานะ:", res.status);
  const text = await res.text();
  console.log("ผลลัพธ์:", text);
}

testLineMessage();