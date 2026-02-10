import { Elysia, t } from "elysia";
import { randomUUID } from "crypto";

// Import Classes
import AuthClass from "../classes/AuthClass";
import UserClass from "../classes/UserClass"; // ✅ ต้องใช้ตัวนี้ดึง Role ล่าสุด
import RefreshTokenClass from "../classes/RefreshTokenClass";
import ActivityLogClass from "../classes/ActivityLogClass";
import { jwtPlugin } from "../utils/jwt-plugin";

// Instantiate Services
const Auth = new AuthClass();
const UserService = new UserClass(); // ✅ เพิ่ม instance
const RefreshTokenService = new RefreshTokenClass();
const LogService = new ActivityLogClass();

const authController = new Elysia({
  prefix: "/auth",
  tags: ["Authentication"],
})
  .use(jwtPlugin)

  // =========================================================
  // 1. 🟢 Login Endpoint
  // =========================================================
  .post(
    "/login",
    async ({ body, jwt, set, cookie: { refreshToken }, request }) => {
      try {
        // A. ตรวจสอบ User/Pass
        const user = await Auth.login(body.email, body.password);

        if (!user) {
          // Log Failed Login
          LogService.createLog({
            user_id: null,
            action: "LOGIN_FAILED",
            entity_type: "SESSION",
            details: `Failed login attempt for: ${body.email}`,
            ip_address: request.headers.get("x-forwarded-for") || "unknown",
            user_agent: request.headers.get("user-agent") || "unknown",
          }).catch((e) => console.error(e));

          set.status = 401;
          return { success: false, message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" };
        }

        // B. ตรวจสอบยืนยันอีเมล
        if (!user.email_verified) {
          set.status = 403;
          return { success: false, message: "กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ" };
        }

        if (refreshToken.value) {
          console.log(
            `🧹 พบ Token เก่าใน Cookie: ${refreshToken.value} -> กำลังลบทิ้ง...`,
          );
          // สั่งลบ Token ตัวเก่าออกจาก DB ทันที
          await RefreshTokenService.revokeToken(refreshToken.value as string);
        }

        // C. สร้าง Access Token
        const accessToken = await jwt.sign({
          id: user.id,
          role: user.role,
        });

        // D. สร้าง Refresh Token (UUID)
        const newRefreshToken = randomUUID();

        // E. บันทึกลง Database
        await RefreshTokenService.createRefreshToken(
          user.id,
          newRefreshToken,
          7,
        );

        // F. ฝังลง Cookie (HttpOnly)
        refreshToken.value = newRefreshToken;
        refreshToken.httpOnly = true;
        refreshToken.secure = process.env.NODE_ENV === "production";
        refreshToken.path = "/";
        refreshToken.maxAge = 7 * 86400;
        refreshToken.sameSite = "lax"; // หรือ 'none' ถ้า Cross-site

        // G. Log Success
        LogService.createLog({
          user_id: user.id,
          action: "LOGIN",
          entity_type: "SESSION",
          entity_id: user.id,
          details: "Login success",
          ip_address: request.headers.get("x-forwarded-for") || "unknown",
          user_agent: request.headers.get("user-agent") || "unknown",
        }).catch((e) => console.error(e));

        return {
          success: true,
          message: "Login successful",
          accessToken,
          // ❌ ไม่ต้องส่ง refreshToken กลับใน body แล้ว เพราะอยู่ใน cookie
          user,
        };
      } catch (error) {
        console.error("Login Error:", error);
        set.status = 500;
        return { success: false, message: "Internal Server Error" };
      }
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
        password: t.String(),
      }),
    },
  )

  // =========================================================
  // 2. 🔴 Logout Endpoint
  // =========================================================
  .post("/logout", async ({ set, cookie: { refreshToken } }) => {
    try {
      const tokenValue = refreshToken.value;

      if (tokenValue) {
        // ✅ ลบเฉพาะ Token เครื่องนี้ (Device Logout)
        // ถ้าอยากลบทุกเครื่อง (Force Logout) ให้สร้าง route แยก เช่น /logout-all
        await RefreshTokenService.revokeToken(tokenValue as string);
      }

      // ลบ Cookie
      refreshToken.remove();

      return { success: true, message: "Logged out successfully" };
    } catch (error) {
      console.error("Logout Error:", error);
      set.status = 500;
      return { success: false, message: "Logout failed" };
    }
  })

  // =========================================================
  // 3. 🔄 Refresh Token Endpoint (ROTATION SYSTEM)
  // =========================================================
  .post("/refresh-token", async ({ jwt, set, cookie: { refreshToken } }) => {
    try {
      const tokenValue = refreshToken.value;

      // 1. เช็ค Cookie
      if (!tokenValue) {
        set.status = 401;
        return { success: false, message: "No refresh token provided" };
      }

      // 2. หา Token ใน DB (ต้องเจอก่อน)
      const storedToken = await RefreshTokenService.findToken(tokenValue as string);

      if (!storedToken) {
        // 🚨 ถ้าไม่เจอ (โดนลบไปแล้ว หรือหมดอายุ) -> ต้องดีดออก
        set.status = 401; 
        return { success: false, message: "Invalid or expired refresh token" };
      }

      // 3. 🛡️ ATOMIC REVOKE: ลบ Token เก่าทิ้งทันที!
      const isDeleted = await RefreshTokenService.revokeToken(tokenValue as string);

      // 🛑 ถ้าลบไม่สำเร็จ (แสดงว่ามีคนแย่งลบไปเสี้ยววินาทีก่อนหน้านี้)
      if (!isDeleted) {
        set.status = 403; // Forbidden
        return { success: false, message: "Refresh token reused detected" };
      }

      // --- ✅ พื้นที่ปลอดภัย ---

      // 4. ดึง User และสร้าง Token ใหม่ตามปกติ
      const currentUser = await UserService.getUserById(storedToken.user_id);
      if (!currentUser) {
         set.status = 401;
         return { success: false, message: "User not found" };
      }

      const newAccessToken = await jwt.sign({
        id: currentUser.id,
        role: currentUser.role, 
      });

      // Cleanup & Rotate
      await RefreshTokenService.rotateUserSessions(currentUser.id, 5);

      const newRefreshToken = randomUUID();
      await RefreshTokenService.createRefreshToken(
        currentUser.id,
        newRefreshToken,
        7
      );

      // Set Cookie ...
      refreshToken.value = newRefreshToken;
      refreshToken.httpOnly = true;
      refreshToken.secure = process.env.NODE_ENV === "production";
      refreshToken.path = "/";
      refreshToken.maxAge = 7 * 86400;
      refreshToken.sameSite = "lax";

      return { success: true, accessToken: newAccessToken };

    } catch (error) {
      console.error("Refresh Error:", error);
      set.status = 401;
      return { success: false, message: "Unauthorized" };
    }
  });

export default authController;
