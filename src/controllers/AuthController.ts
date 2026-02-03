import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { randomUUID } from "crypto"; // ✅ ใช้สร้าง Refresh Token

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
  // 1. Setup JWT (Access Token อายุสั้น)
  .use(
    jwt({
      name: "jwt",
      secret: process.env.JWT_SECRET || "secret-key-change-me",
      exp: "15m", // ✅ Access Token ควรมีอายุสั้น (เช่น 15 นาที) เพราะเรามี Refresh Token แล้ว
    }),
  )

  // 2. Login Endpoint
  .post(
    "/login",
    async ({ body, jwt, set, request }) => {
      try {
        // A. เรียกใช้ AuthClass เพื่อตรวจสอบ User/Pass
        const user = await Auth.login(body.email, body.password);

        // กรณี Login ไม่ผ่าน
        if (!user) {
          // (Optional) เก็บ Log ความล้มเหลว
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

        // กรณี Login ผ่าน... เริ่มกระบวนการสร้าง Token

        // B. สร้าง Access Token (JWT)
        const accessToken = await jwt.sign({
          id: user.id, // UUID
          role: user.role,
          // username: user.username // ใส่เพิ่มได้ถ้าจำเป็น
        });

        // C. สร้าง Refresh Token (UUID)
        const refreshToken = randomUUID();

        // D. บันทึก Refresh Token ลง Database (อายุ 7 วัน)
        await RefreshTokenService.createRefreshToken(
          user.id, // user_id
          refreshToken, // token string
          7, // days
        );

        // E. บันทึก Log การ Login สำเร็จ
        LogService.createLog({
          user_id: user.id,
          action: "LOGIN",
          entity_type: "SESSION",
          entity_id: user.id, // หรือใส่ ID ของ session ถ้ามี
          details: "User logged in successfully via Password",
          ip_address: request.headers.get("x-forwarded-for") || "unknown",
          user_agent: request.headers.get("user-agent") || "unknown",
        }).catch((e) => console.error("Log Error:", e));

        // F. ส่ง Response กลับ
        return {
          success: true,
          message: "Login successful",
          accessToken: accessToken, // ใช้ยิง API ทั่วไป
          refreshToken: refreshToken, // เก็บไว้ใน HttpOnly Cookie หรือ LocalStorage เพื่อขอ Access Token ใหม่
          user: user,
        };
      } catch (error) {
        console.error("Login Error:", error);
        set.status = 500;
        return { success: false, message: "Internal Server Error" };
      }
    },
    {
      // Input Validation
      body: t.Object({
        email: t.String({ format: "email" }),
        password: t.String(),
      }),
    },
  )

  // --- ✅ 2. เพิ่ม: Logout Endpoint (เพื่อให้ Token หายจาก DB) ---
  .post(
    "/logout",
    async ({ body, set }) => {
      try {
        // 1. ค้นหา Token ใน DB ก่อน เพื่อจะได้รู้ว่าเป็น User ID อะไร
        const storedToken = await RefreshTokenService.findToken(
          body.refreshToken,
        );

        // ถ้าเจอ Token (แสดงว่าเคย Login ไว้จริง)
        if (storedToken) {
          // 2. สั่งลบ Token ทั้งหมดของ User คนนี้! (ไม่ใช่แค่ Token เดียว)
          // คุณต้องไปเพิ่มฟังก์ชัน revokeAllUserTokens ใน Class RefreshTokenService ด้วยนะครับ
          await RefreshTokenService.revokeAllUserTokens(storedToken.user_id);

          return {
            success: true,
            message: "Logged out from all devices successfully",
          };
        }

        // กรณีไม่เจอ Token (อาจจะลบไปแล้ว หรือ Token มั่ว)
        // ก็ตอบ Success ไปเพื่อให้ Frontend เคลียร์หน้าจอได้ตามปกติ
        return {
          success: true,
          message: "Token not found, but session cleared on client",
        };
      } catch (error) {
        console.error("Logout Error:", error);
        set.status = 500;
        return { success: false, message: "Logout failed" };
      }
    },
    {
      body: t.Object({
        refreshToken: t.String(),
      }),
    },
  )

  // --- ✅ 3. แถม: Refresh Token Endpoint (สำหรับต่ออายุ) ---
  .post(
    "/refresh-token",
    async ({ body, jwt, set }) => {
      try {
        // 1. เช็คว่ามี Token ใน DB ไหม และหมดอายุยัง
        const storedToken = await RefreshTokenService.findToken(
          body.refreshToken,
        );

        if (!storedToken) {
          set.status = 401;
          return {
            success: false,
            message: "Invalid or expired refresh token",
          };
        }

        // 2. ถ้าเจอและถูกต้อง -> สร้าง Access Token ใบใหม่
        const newAccessToken = await jwt.sign({
          id: storedToken.user_id, // หรือ user.id ตามโมเดล
          role: "user", // *ควรดึง Role จริงจาก User Table อีกทีถ้าเป็นไปได้
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
    },
    {
      body: t.Object({
        refreshToken: t.String(),
      }),
    },
  );

export default authController;
