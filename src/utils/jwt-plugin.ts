import { jwt } from "@elysiajs/jwt";

// ใช้ค่า Default ที่เหมือนกันทั้งระบบ (ช่วยให้ Dev ง่ายขึ้นและตัดปัญหา Env ไม่ติด)
const SECRET = process.env.JWT_SECRET || "MY_SUPER_SECRET_KEY_123";

export const jwtPlugin = jwt({
  name: "jwt",
  secret: SECRET,
  exp: "1h", // อายุ Token 7 วัน
});