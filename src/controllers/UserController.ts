// controllers/UserController.ts
import { Elysia, t } from "elysia";
import bcrypt from "bcryptjs";

import UserClass from "../classes/UserClass";
import { UserModel } from "../models/UserModel";
import { EmailVerification } from "../classes/EmailVerificationClass";
import { AuthGuardClass } from "../classes/AuthGuardClass";
import { jwtPlugin } from "../utils/jwt-plugin";
import ActivityLogClass from "../classes/ActivityLogClass";
import { sendLineNotification } from "../services/lineService";

const UserService = new UserClass();
const AuthGuard = new AuthGuardClass();
const LogService = new ActivityLogClass();

type CreateUserInput = Omit<
  UserModel,
  "user_id" | "created_at" | "updated_at"
> & {
  created_at?: Date;
  updated_at?: Date;
};

const userController = new Elysia({
  prefix: "/users",
  tags: ["Users"],
})
  .use(jwtPlugin)

  // ============================================================
  // 🟢 ดึงข้อมูลตัวเอง (Profile)
  // ============================================================
  .get("/me", async ({ request, jwt, set }) => {
    const payload = await AuthGuard.validate(request, jwt);
    if (!payload) {
      set.status = 401;
      return { success: false, message: "Unauthorized" };
    }

    try {
      const fullUserData = await UserService.getUserById(payload.id);
      if (!fullUserData) {
        set.status = 404;
        return { success: false, message: "User not found in database" };
      }

      const { password, ...safeUser } = fullUserData;
      return { success: true, user: safeUser };
    } catch (error) {
      console.error("Database Error:", error);
      set.status = 500;
      return { success: false, message: "Internal Server Error" };
    }
  })

  // ============================================================
  // 🟢 ดึงข้อมูลผู้ใช้ทั้งหมด
  // ============================================================
  .get("/", async () => {
    try {
      const users = await UserService.getAllUsers();
      return users;
    } catch (error) {
      console.error(error);
      throw new Error("Failed to fetch users");
    }
  })

  // ============================================================
  // 🟢 ดึงข้อมูลผู้ใช้ตาม UUID
  // ============================================================
  .get("/:uuid", async ({ params }) => {
    try {
      const user = await UserService.getUserById(String(params.uuid));
      if (!user) throw new Error("User not found");
      return user;
    } catch (error) {
      console.error(error);
      throw new Error("Failed to fetch user");
    }
  }, {
    params: t.Object({ uuid: t.String() }),
  })

  // ============================================================
  // 🔵 สร้างผู้ใช้ใหม่ (รองรับทั้งสมัครเอง และ Admin/Super Admin สร้างให้)
  // ============================================================
  .post("/", async ({ body, set, request, jwt }) => {
    try {
      console.log("➡️ Starting user creation process...");

      // 1. Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(body.password, salt);

      // 2. Prepare payload
      const newUserPayload = {
        ...body,
        password: hashedPassword,
      } as CreateUserInput;

      // 3. Create user ลง Database
      const newUserId = await UserService.createUser(newUserPayload);
      console.log("✅ Created user:", newUserId);

      // 4. Create verification token & Send Email
      const token = await EmailVerification.create(newUserId);
      await EmailVerification.sendVerifyEmail(body.email, token);
      console.log("✅ Sent verification email");

      // 5. ส่งแจ้งเตือนไปที่ LINE OA
      await sendLineNotification(
        `🎉 มีผู้ใช้ใหม่เพิ่มในระบบ PetTerrain\n👤 ${body.username}\n📧 ${body.email}`
      );

      // ===============================================================
      // 🔒 6. แยกระบบ LOG อย่างเป็นระบบ (เช็ค Token แบบปลอดภัย)
      // ===============================================================
      let creatorId = newUserId; // ค่าเริ่มต้นถือว่าสมัครเอง
      let creatorRole = "user";

      try {
        // ใช้ AuthGuard ดึงข้อมูลคนทำรายการ (ถ้าเป็น public จะดึงไม่ได้และเข้า catch)
        const currentUser = await AuthGuard.validate(request, jwt);
        if (currentUser) {
          creatorId = currentUser.id;
          creatorRole = currentUser.role;
        }
      } catch (err) {
        // ปล่อยผ่าน เพราะแปลว่าไม่มี Token (User กดสมัครผ่านหน้าเว็บปกติ)
      }

      // ตรวจสอบว่าใครเป็นคนสร้าง
      if (creatorRole === "super_admin" || creatorRole === "admin") {
        // 📝 กรณี: Admin / Super Admin สร้างให้จากหลังบ้าน
        await LogService.createLog({
          user_id: creatorId, 
          action: "CREATE_USER_BY_ADMIN",
          entity_type: "USER",
          entity_id: newUserId, 
          details: {
            message: `${creatorRole === "super_admin" ? "Super Admin" : "Admin"} created a new user account`,
            new_user_email: body.email,
            assigned_role: body.role || "user",
          },
          ip_address: request.headers.get("x-forwarded-for") || "unknown",
          user_agent: request.headers.get("user-agent") || "unknown",
        });
        console.log(`📝 Logged ${creatorRole} Creation Activity`);

      } else {
        // 📝 กรณี: User ทั่วไปกดสมัครสมาชิกเอง
        await LogService.createLog({
          user_id: newUserId, 
          action: "REGISTER_USER",
          entity_type: "USER",
          entity_id: newUserId,
          details: {
            message: "User self-registered",
            email: body.email,
          },
          ip_address: request.headers.get("x-forwarded-for") || "unknown",
          user_agent: request.headers.get("user-agent") || "unknown",
        });
        console.log("📝 Logged Public Registration Activity");
      }
      // ===============================================================

      set.status = 201;
      return {
        success: true,
        message: "User created and verification email sent",
        user_id: newUserId,
      };

    } catch (error) {
      console.error("❌ Error creating user or sending email:", error);
      const message = error instanceof Error ? error.message : String(error);

      if (message === "อีเมลนี้มีอยู่แล้ว") {
        set.status = 400;
        return { success: false, message: "อีเมลนี้มีอยู่แล้ว" };
      }

      set.status = 500;
      return { success: false, message: "Failed to create user", error: message };
    }
  }, {
    body: t.Object({
      username: t.String({ minLength: 3 }),
      email: t.String({ format: "email" }),
      password: t.String({ minLength: 6 }),
      role: t.Optional(t.String()),
      phone: t.Optional(t.String()),
      is_active: t.Optional(t.Number()),
    }),
  })

  // ============================================================
  // 🟢 เช็คว่ายืนยันอีเมลหรือยัง
  // ============================================================
  .get("/check-verified", async ({ query, set }) => {
    try {
      const user = await UserService.getUserByEmail(query.email);
      if (!user) {
        set.status = 404;
        return { success: false, message: "User not found" };
      }
      return { success: true, email_verified: user.email_verified };
    } catch (error) {
      console.error("Check verified error:", error);
      set.status = 500;
      return { success: false, message: "Internal server error" };
    }
  }, {
    query: t.Object({ email: t.String({ format: "email" }) }),
  })

  // ============================================================
  // 🟡 แก้ไขข้อมูลผู้ใช้ (อัปเดตโปรไฟล์ตัวเอง หรือ Admin แก้ให้)
  // ============================================================
  .put("/:id", async ({ params, body, request, jwt, set }) => {
    try {
      const currentUser = await AuthGuard.validate(request, jwt);
      if (!currentUser) {
        set.status = 401;
        return { success: false, message: "Unauthorized" };
      }

      if (currentUser.id !== params.id && currentUser.role !== "admin" && currentUser.role !== "super_admin") {
        set.status = 403;
        return { success: false, message: "Forbidden: You can only update your own account" };
      }

      const ok = await UserService.updateUser(params.id, body);
      if (!ok) {
        set.status = 404;
        return { success: false, message: "User not found or no changes made" };
      }

      await LogService.createLog({
        user_id: currentUser.id,
        action: "UPDATE_USER",
        entity_type: "USER",
        entity_id: params.id,
        details: { message: "Updated user profile", fields_updated: Object.keys(body) },
        ip_address: request.headers.get("x-forwarded-for") || "unknown",
        user_agent: request.headers.get("user-agent") || "unknown",
      });

      return { success: true, message: "User updated successfully" };
    } catch (error) {
      console.error("Update Error:", error);
      set.status = 500;
      return { success: false, message: "Failed to update user" };
    }
  }, {
    params: t.Object({ id: t.String() }),
    body: t.Partial(t.Object({
      username: t.String({ minLength: 3 }),
      first_name: t.String(),
      last_name: t.String(),
      phone: t.String(),
      is_active: t.Optional(t.Number()),
    })),
  })

  // ============================================================
  // 🟡 เปลี่ยนรหัสผ่าน (ใช้รหัสเดิมยืนยัน)
  // ============================================================
  .put("/:id/password", async ({ params, body, request, jwt, set }) => {
    try {
      const currentUser = await AuthGuard.validate(request, jwt);
      if (!currentUser) {
        set.status = 401;
        return { success: false, message: "Unauthorized" };
      }

      if (currentUser.id !== params.id && currentUser.role !== "admin" && currentUser.role !== "super_admin") {
        set.status = 403;
        return { success: false, message: "Forbidden" };
      }

      const existingUser = await UserService.getUserById(params.id);
      if (!existingUser) {
        set.status = 404;
        return { success: false, message: "User not found" };
      }

      const match = await bcrypt.compare(body.oldPassword, existingUser.password);
      if (!match) {
        set.status = 400;
        return { success: false, message: "รหัสผ่านเดิมไม่ถูกต้อง" };
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(body.newPassword, salt);

      const ok = await UserService.updatePassword(params.id, hashedPassword);
      if (!ok) {
        set.status = 404;
        return { success: false, message: "User not found" };
      }

      await LogService.createLog({
        user_id: currentUser.id,
        action: "CHANGE_PASSWORD",
        entity_type: "USER",
        entity_id: params.id,
        details: "User changed password",
        ip_address: request.headers.get("x-forwarded-for") || "unknown",
        user_agent: request.headers.get("user-agent") || "unknown",
      });

      return { success: true, message: "Password updated successfully" };
    } catch (error) {
      console.error("Update Password Error:", error);
      set.status = 500;
      return { success: false, message: "Failed to update password" };
    }
  }, {
    params: t.Object({ id: t.String() }),
    body: t.Object({
      oldPassword: t.String({ minLength: 6 }),
      newPassword: t.String({ minLength: 6 }),
    }),
  })

  // ============================================================
  // 🟠 เปิด/ปิด สถานะผู้ใช้ (Activate/Deactivate) - เฉพาะแอดมิน
  // ============================================================
  .patch("/:id/active", async ({ params, body, request, jwt, set }) => {
    try {
      const adminUser = await AuthGuard.validateAdmin(request, jwt);
      if (!adminUser) {
        set.status = 403;
        return { success: false, message: "Forbidden: Admin access required" };
      }

      const ok = await UserService.setActive(params.id, body.is_active);
      if (!ok) throw new Error("User not found");

      await LogService.createLog({
        user_id: adminUser.id,
        action: body.is_active ? "ACTIVATE_USER" : "DEACTIVATE_USER",
        entity_type: "USER",
        entity_id: params.id,
        details: `Admin set status to ${body.is_active}`,
        ip_address: request.headers.get("x-forwarded-for") || "unknown",
        user_agent: request.headers.get("user-agent") || "unknown",
      });

      return { success: true, message: "User status updated" };
    } catch (error) {
      console.error(error);
      set.status = 500;
      return { success: false, message: "Failed to update status" };
    }
  }, {
    params: t.Object({ id: t.String() }),
    body: t.Object({ is_active: t.Number() }),
  })

  // ============================================================
  // 🔴 ลบผู้ใช้ (เฉพาะแอดมิน)
  // ============================================================
  .delete("/:id", async ({ params, request, jwt, set }) => {
    try {
      const adminUser = await AuthGuard.validateAdmin(request, jwt);
      if (!adminUser) {
        set.status = 403;
        return { success: false, message: "Forbidden: Admin access required" };
      }

      const ok = await UserService.deleteUser(params.id);
      if (!ok) {
        set.status = 404;
        return { success: false, message: "User not found" };
      }

      await LogService.createLog({
        user_id: adminUser.id,
        action: "DELETE_USER",
        entity_type: "USER",
        entity_id: params.id,
        details: `User deleted by Admin`,
        ip_address: request.headers.get("x-forwarded-for") || "unknown",
        user_agent: request.headers.get("user-agent") || "unknown",
      });

      return { success: true, message: "User deleted successfully" };
    } catch (error) {
      console.error("Delete Error:", error);
      set.status = 500;
      return { success: false, message: "Failed to delete user" };
    }
  }, {
    params: t.Object({ id: t.String() }),
  });

export default userController;