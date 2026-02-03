import { Elysia, t } from "elysia";
import { EmailVerification } from "../classes/EmailVerificationClass";
import UserClass from "../classes/UserClass";

const UserService = new UserClass();

const verifyController = new Elysia({ prefix: "/verify-email" })

  // ✅ ยืนยันอีเมล
  .get(
    "/",
    async ({ query, set }) => {
      try {
        const success = await EmailVerification.verify(query.token);

        if (!success) {
          set.status = 400;
          return { success: false, message: "Invalid or expired token" };
        }

        return { success: true, message: "Email verified successfully" };
      } catch (error) {
        console.error("❌ Verify error:", error);
        set.status = 500;
        return { success: false, message: "Internal server error" };
      }
    },
    {
      query: t.Object({
        token: t.String(),
      }),
    }
  )

  // ✅ ส่งอีเมลยืนยันใหม่ (Resend)
  .post(
    "/resend",
    async ({ body, set }) => {
      try {
        const user = await UserService.getUserByEmail(body.email);

        if (!user) {
          set.status = 404;
          return { success: false, message: "User not found" };
        }

        if (user.email_verified === 1) {
          return { success: false, message: "Email already verified" };
        }

        // 🔍 ตรวจสอบว่ามี token เดิมที่ยังไม่หมดอายุหรือยัง
        const [existing] = await EmailVerification.findValidToken(user.id);

        let token: string;

        if (existing) {
          // ✅ ใช้ token เดิม
          token = existing.token;
          console.log("♻️ Reusing existing verification token:", token);
        } else {
          // 🆕 สร้าง token ใหม่
          token = await EmailVerification.create(user.id);
          console.log("✨ Created new verification token:", token);
        }

        await EmailVerification.sendVerifyEmail(user.email, token);

        return { success: true, message: "Verification email resent" };
      } catch (error) {
        console.error("❌ Resend error:", error);
        set.status = 500;
        return {
          success: false,
          message: "Failed to resend verification email",
        };
      }
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
      }),
    }
  );

export default verifyController;