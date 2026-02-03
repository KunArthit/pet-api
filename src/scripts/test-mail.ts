// src/scripts/test-email.ts
import { emailTransporter } from "../core/email";
import { env } from "../core/config";

async function testEmail() {
  try {
    await emailTransporter.verify();
    console.log("✅ SMTP connected");

    await emailTransporter.sendMail({
      from: `"${env.COMPANY_NAME}" <${env.FROM_EMAIL}>`,
      to: env.SMTP_USER, // ส่งหาตัวเอง
      subject: "SMTP Test",
      text: "Gmail SMTP พร้อมใช้งานแล้ว 🎉"
    });

    console.log("📧 Test email sent");
  } catch (err) {
    console.error("❌ SMTP error:", err);
  }
}

testEmail();