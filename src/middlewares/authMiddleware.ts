import { Elysia } from "elysia";
import { jwt } from "@elysiajs/jwt";

export const authGuard = new Elysia()
  .use(
    jwt({
      name: "jwt",
      secret: process.env.JWT_SECRET || "secret-key-change-me",
    })
  )
  .derive(async ({ jwt, cookie: { auth }, request }) => {
    // 1. ดึง Token จาก Header (Bearer ...)
    const authHeader = request.headers.get("authorization");
    let token = authHeader && authHeader.startsWith("Bearer ") 
      ? authHeader.slice(7) 
      : null;

    // 2. ถ้าไม่มีใน Header ลองดูใน Cookie (เผื่อใช้)
    // ✅ แก้ error ตรงนี้: เพิ่ม 'as string' เพื่อยืนยัน type
    if (!token && auth && auth.value) {
        token = auth.value as string;
    }

    // 3. ตรวจสอบความถูกต้องของ Token
    if (!token) {
      return { user: null };
    }

    const payload = await jwt.verify(token);
    if (!payload) {
      return { user: null };
    }

    // 4. ถ้าผ่าน -> ส่งข้อมูล user (id, role) ไปให้ Controller ใช้งานต่อ
    return {
      user: payload,
    };
  })
  .macro(({ onBeforeHandle }) => ({
    // Macro สำหรับเช็ค Login
    isSignIn(value: boolean) {
      if (!value) return;
      // ✅ แก้ error ตรงนี้: ใส่ type ': any' ให้กับ ctx เพื่อปิด error
      onBeforeHandle(({ user, set }: any) => {
        if (!user) {
          set.status = 401;
          throw new Error("Unauthorized: Please login first");
        }
      });
    },
    // Macro สำหรับเช็ค Admin (ถ้าต้องการใช้)
    isAdmin(value: boolean) {
      if (!value) return;
      // ✅ แก้ error ตรงนี้: ใส่ type ': any' เหมือนกัน
      onBeforeHandle(({ user, set }: any) => {
        // เช็คว่า user มีจริงไหม และ role เป็น admin หรือไม่
        if (!user || user.role !== "admin") {
          set.status = 403;
          throw new Error("Forbidden: Admin access required");
        }
      });
    }
  }));