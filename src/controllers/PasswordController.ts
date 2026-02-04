import { Elysia, t } from "elysia";
import bcrypt from "bcryptjs";
import PasswordResetClass from "../classes/PasswordResetClass";
import AuthClass from "../classes/AuthClass";
import ActivityLogClass from "../classes/ActivityLogClass";
import { emailTransporter } from "../core/email";
import { env } from "../core/config";

const PasswordResetService = new PasswordResetClass();
const Auth = new AuthClass();
const LogService = new ActivityLogClass();

export const passwordController = new Elysia({
  prefix: "/auth",
  tags: ["Authentication"],
})

  // --- 📩 ส่งลิงก์ Reset Password ไปทางอีเมล ---
  .post(
    "/forgot-password",
    async ({ body, request, set }) => {
      const { email } = body;
      const user = await Auth.findByEmail(email);

      if (!user) {
        set.status = 404;
        return { success: false, message: "ไม่พบบัญชีผู้ใช้นี้" };
      }

      const token = await PasswordResetService.create(user.id);
      const resetLink = `${env.FRONTEND_URL}/reset-password?token=${token}`;

      await emailTransporter.sendMail({
        from: `"${env.COMPANY_NAME}" <${env.FROM_EMAIL}>`,
        to: email,
        subject: "🔐 รีเซ็ตรหัสผ่านของคุณ | Pet Terrain",
        html: `
        <div style="
          font-family: 'Segoe UI', Arial, sans-serif;
          background-color: #f7fafc;
          padding: 40px 0;
          color: #333;
        ">
          <div style="
            max-width: 480px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 20px;
            box-shadow: 0 4px 10px rgba(0,0,0,0.05);
            padding: 40px 30px;
          ">
            <!-- Logo -->
            <div style="text-align: center; margin-bottom: 30px;">
              <div style="font-size: 28px; font-weight: bold; color: #79A68F;">
                🐾 ${env.COMPANY_NAME}
              </div>
            </div>
      
            <!-- Header -->
            <h2 style="text-align: center; color: #222; margin-bottom: 10px;">
              รีเซ็ตรหัสผ่านของคุณ
            </h2>
            <p style="text-align: center; color: #555; font-size: 15px; margin-bottom: 30px;">
              คุณได้ส่งคำขอเพื่อรีเซ็ตรหัสผ่านของบัญชีของคุณ<br/>
              หากคุณไม่ได้ร้องขอ สามารถเพิกเฉยต่ออีเมลนี้ได้เลย
            </p>
      
            <!-- Button -->
            <div style="text-align: center; margin: 35px 0;">
              <a href="${resetLink}"
                style="
                  background-color: #79A68F;
                  color: white;
                  padding: 14px 30px;
                  border-radius: 8px;
                  text-decoration: none;
                  font-weight: bold;
                  display: inline-block;
                  letter-spacing: 0.5px;
                "
              >
                🔑 ตั้งรหัสผ่านใหม่
              </a>
            </div>
      
            <!-- Footer -->
            <p style="font-size: 13px; color: #777; text-align: center; line-height: 1.5;">
              ลิงก์นี้จะหมดอายุใน <strong>15 นาที</strong><br/>
              หากปุ่มด้านบนไม่ทำงาน คุณสามารถคัดลอกลิงก์ด้านล่างไปวางในเบราว์เซอร์ได้:
            </p>
      
            <div style="
              word-break: break-all;
              background: #f1f5f9;
              padding: 10px 15px;
              border-radius: 8px;
              font-size: 12px;
              color: #444;
              margin-top: 10px;
            ">
              ${resetLink}
            </div>
      
            <div style="text-align: center; margin-top: 40px; color: #aaa; font-size: 12px;">
              © ${new Date().getFullYear()} ${env.COMPANY_NAME}. All rights reserved.
            </div>
          </div>
        </div>
        `,
      });

      LogService.createLog({
        user_id: user.id,
        action: "FORGOT_PASSWORD_REQUEST",
        entity_type: "USER",
        entity_id: user.id,
        details: `Password reset link sent to ${email}`,
        ip_address: request.headers.get("x-forwarded-for") || "unknown",
        user_agent: request.headers.get("user-agent") || "unknown",
      }).catch(console.error);

      return { success: true, message: "ส่งลิงก์รีเซ็ตรหัสผ่านแล้ว" };
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
      }),
    }
  )

  // --- 🔑 ตั้งรหัสผ่านใหม่ ---
  .post(
    "/reset-password",
    async ({ body, set }) => {
      const { token, newPassword } = body;

      const userId = await PasswordResetService.verify(token);
      if (!userId) {
        set.status = 400;
        return { success: false, message: "Token ไม่ถูกต้องหรือหมดอายุแล้ว" };
      }

      const hashed = await bcrypt.hash(newPassword, 10);
      await Auth.updatePassword(userId, hashed);
      await PasswordResetService.delete(token);

      return { success: true, message: "เปลี่ยนรหัสผ่านสำเร็จ" };
    },
    {
      body: t.Object({
        token: t.String(),
        newPassword: t.String({ minLength: 6 }),
      }),
    }
  );