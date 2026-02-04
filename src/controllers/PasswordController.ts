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
        subject: "รีเซ็ตรหัสผ่านของคุณ",
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #222;">
            <h2>รีเซ็ตรหัสผ่าน</h2>
            <p>คุณสามารถเปลี่ยนรหัสผ่านใหม่ได้โดยคลิกปุ่มด้านล่าง</p>
            <a href="${resetLink}" 
              style="background:#007bff;color:#fff;padding:10px 20px;border-radius:5px;text-decoration:none;">
              ตั้งรหัสผ่านใหม่
            </a>
            <p>ลิงก์นี้จะหมดอายุใน 15 นาที</p>
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