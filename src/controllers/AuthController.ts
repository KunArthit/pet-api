import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { randomUUID } from "crypto";

// Import Classes
import AuthClass from "../classes/AuthClass";
import RefreshTokenClass from "../classes/RefreshTokenClass";
import ActivityLogClass from "../classes/ActivityLogClass";

// Instantiate Services
const Auth = new AuthClass();
const RefreshTokenService = new RefreshTokenClass();
const LogService = new ActivityLogClass();

const authController = new Elysia({
  prefix: "/auth",
  tags: ["Authentication"],
})
  // 1. Setup JWT
  .use(
    jwt({
      name: "jwt",
      secret: process.env.JWT_SECRET || "secret-key-change-me",
      exp: "15m",
    })
  )

  // 2. Login Endpoint
  // ✅ เพิ่ม: รับ cookie เข้ามาใน parameter
  .post(
    "/login",
    async ({ body, jwt, set, cookie: { refreshToken }, request }) => {
      try {
        // A. ตรวจสอบ User/Pass
        const user = await Auth.login(body.email, body.password);

        if (!user) {
          // Log Failed ...
          LogService.createLog({
            user_id: null,
            action: "LOGIN_FAILED",
            entity_type: "SESSION",
            details: `Failed login attempt for: ${body.email}`,
            ip_address: request.headers.get("x-forwarded-for") || "unknown",
            user_agent: request.headers.get("user-agent") || "unknown",
          }).catch((e) => console.error("Log Error:", e));

          set.status = 401;
          return {
            success: false,
            message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง (หรือบัญชีถูกระงับ)",
          };
        }

        // B. สร้าง Access Token (JWT)
        const accessToken = await jwt.sign({
          id: user.id,
          role: user.role,
        });

        // C. สร้าง Refresh Token (UUID)
        const newRefreshToken = randomUUID();

        // D. บันทึก Refresh Token ลง Database
        await RefreshTokenService.createRefreshToken(
          user.id,
          newRefreshToken,
          7
        );

        // ✅ แก้ไขจุดที่ 1: ฝัง Refresh Token ลงใน Cookie (HttpOnly)
        // แทนการส่งกลับไปใน JSON
        refreshToken.value = newRefreshToken;
        refreshToken.httpOnly = true; // ห้าม JS อ่าน (กัน XSS)
        refreshToken.secure = process.env.NODE_ENV === "production"; // ใช้ HTTPS เท่านั้นใน Production
        refreshToken.path = "/"; // ส่ง Cookie นี้ไปทุก Path (เพื่อให้ /auth/logout, /auth/refresh-token มองเห็น)
        refreshToken.maxAge = 7 * 86400; // 7 วัน (หน่วยวินาที)
        refreshToken.sameSite = "lax"; // กัน CSRF เบื้องต้น

        // E. Log Success
        LogService.createLog({
          user_id: user.id,
          action: "LOGIN",
          entity_type: "SESSION",
          entity_id: user.id,
          details: "User logged in successfully",
          ip_address: request.headers.get("x-forwarded-for") || "unknown",
          user_agent: request.headers.get("user-agent") || "unknown",
        }).catch((e) => console.error("Log Error:", e));

        // F. ส่ง Response กลับ (ไม่ต้องส่ง refreshToken ใน body แล้ว)
        return {
          success: true,
          message: "Login successful",
          accessToken: accessToken, // Frontend เก็บลง LocalStorage
          user: user,
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
    }
  )

  // --- 3. Logout Endpoint ---
  // ✅ แก้ไข: อ่าน Token จาก Cookie แทน Body
  .post(
    "/logout",
    async ({ set, cookie: { refreshToken } }) => {
      try {
        const tokenValue = refreshToken.value;

        if (tokenValue) {
          // 1. หาข้อมูล Token เพื่อเอา User ID
          const storedToken = await RefreshTokenService.findToken(tokenValue as string);

          if (storedToken) {
            // 2. ลบ Token ใน DB (คุณเลือกจะลบทั้งหมด ก็ใช้ฟังก์ชันเดิม)
            await RefreshTokenService.revokeAllUserTokens(storedToken.user_id);
          }
        }

        // ✅ แก้ไขจุดที่ 2: ลบ Cookie ออกจาก Browser
        refreshToken.remove();

        return {
          success: true,
          message: "Logged out successfully",
        };
      } catch (error) {
        console.error("Logout Error:", error);
        set.status = 500;
        return { success: false, message: "Logout failed" };
      }
    }
    // ไม่ต้อง validate body แล้ว เพราะรับจาก cookie
  )

  // --- 4. Refresh Token Endpoint ---
  // ✅ แก้ไข: อ่าน Token จาก Cookie แทน Body
  .post(
    "/refresh-token",
    async ({ jwt, set, cookie: { refreshToken } }) => {
      try {
        // 1. ดึง Token จาก Cookie
        const tokenValue = refreshToken.value;

        if (!tokenValue) {
          set.status = 401;
          return {
            success: false,
            message: "No refresh token provided",
          };
        }

        // 2. เช็คใน DB
        const storedToken = await RefreshTokenService.findToken(tokenValue as string);

        if (!storedToken) {
          set.status = 401;
          return {
            success: false,
            message: "Invalid or expired refresh token",
          };
        }

        // 3. สร้าง Access Token ใหม่
        const newAccessToken = await jwt.sign({
          id: storedToken.user_id,
          role: "user", // แนะนำให้ query user จริงๆ มาใส่ role ล่าสุด
        });

        return {
          success: true,
          accessToken: newAccessToken,
        };
      } catch (error) {
        console.error("Refresh Error:", error);
        set.status = 401;
        return { success: false, message: "Unauthorized" };
      }
    }
  );

export default authController;