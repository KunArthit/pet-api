import { Elysia } from "elysia";
import { jwtPlugin } from "../utils/jwt-plugin";

export const authGuard = new Elysia()
  .use(jwtPlugin)
  .derive(async ({ jwt, request, cookie: { auth } }) => {
    // 📢 Log จุดที่ 1: ดูซิว่ามันวิ่งเข้ามาทำงานไหม?
    console.log("\n🔥 [DEBUG] 1. Inline Guard Start!");

    // 1. ดึง Token
    const authHeader = request.headers.get("authorization");
    console.log("🔍 [DEBUG] 2. Header:", authHeader);

    let token = authHeader && authHeader.startsWith("Bearer ") 
      ? authHeader.slice(7) 
      : null;

    if (!token && auth && auth.value) {
        console.log("🍪 [DEBUG] Found token in cookie");
        token = auth.value as string;
    }

    if (!token) {
      console.log("❌ [DEBUG] 3. No Token Found!");
      return { user: null };
    }

    // 2. ลองไขกุญแจ Verify
    try {
      const payload = await jwt.verify(token);
      
      if (!payload) {
        console.log("❌ [DEBUG] 4. Verify Failed (Invalid Signature/Expired)");
        return { user: null };
      }

      console.log("✅ [DEBUG] 5. Verify Success! User ID:", payload.id);
      return { user: payload };

    } catch (error) {
      console.error("💥 [DEBUG] Exception:", error);
      return { user: null };
    }
  })
  .derive(async ({ jwt, cookie: { auth }, request }) => {
    // 1. ดึง Token จาก Header (Bearer ...)

    console.log(request);
    console.log(auth);

    console.log(jwt);

    const authHeader = request.headers.get("authorization");

    console.log("authHeader: ",authHeader);
    
    let token =
      authHeader && authHeader.startsWith("Bearer ")
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
    },
  }));
