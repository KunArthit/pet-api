import { Elysia } from "elysia";

export class AuthGuardClass {
  
  /**
   * 1. ตรวจสอบแค่ว่า "Login หรือยัง?" (คืนค่า User หรือ null)
   */
  async validate(request: Request, jwt: any): Promise<any | null> {
    const authHeader = request.headers.get("authorization");
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return null;
    }

    const token = authHeader.slice(7);

    try {
      const payload = await jwt.verify(token);
      return payload || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * 2. ตรวจสอบว่า "เป็น Admin หรือไม่?" (คืนค่า User หรือ null)
   * (Logic เดิมจาก isAdmin macro)
   */
  async validateAdmin(request: Request, jwt: any): Promise<any | null> {
    const user = await this.validate(request, jwt); // เรียกใช้ฟังก์ชันข้างบนก่อน

    if (!user) return null; // ไม่ได้ Login

    // เช็ค Role (อนุญาตทั้ง admin และ super_admin)
    const allowedRoles = ["admin", "super_admin", "Super admin"];
    if (!allowedRoles.includes(user.role)) {
      console.log(`⛔ User ${user.id} tried to access Admin route but role is ${user.role}`);
      return null; 
    }

    return user;
  }

  /**
   * 3. ตรวจสอบว่า "เป็น Super Admin เท่านั้น!" 
   * (Logic เดิมจาก isSuperAdmin macro)
   */
  async validateSuperAdmin(request: Request, jwt: any): Promise<any | null> {
    const user = await this.validate(request, jwt);

    if (!user) return null;

    // เช็คเข้มงวด ต้องเป็น super_admin เท่านั้น
    if (user.role !== "super_admin") {
      return null;
    }

    return user;
  }
}