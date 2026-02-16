// controllers/UserController.ts
import { Elysia, t } from "elysia";
import bcrypt from "bcryptjs";

import UserClass from "../classes/UserClass";
import { UserModel } from "../models/UserModel";
import { EmailVerification } from "../classes/EmailVerificationClass";
import { authGuard } from "../middlewares/authMiddleware";
import { AuthGuardClass } from "../classes/AuthGuardClass";
import { jwtPlugin } from "../utils/jwt-plugin";
import ActivityLogClass from "../classes/ActivityLogClass";
import { sendLineNotification } from "../services/lineService"; // 🆕 เพิ่มบรรทัดนี้


console.log("🧐 CHECK IMPORT:", authGuard);
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

  .get("/me", async ({ request, jwt, set }) => {
    
    // 1. แกะ Token เพื่อเอา ID (Payload มีแค่ { id, role, exp })
    const payload = await AuthGuard.validate(request, jwt);

    if (!payload) {
      set.status = 401;
      return { success: false, message: "Unauthorized" };
    }

    try {
      // 2. เอา ID ไปดึงข้อมูล "ตัวเต็ม" จาก Database
      // (ข้อมูลจะ Update ล่าสุดเสมอ แม้ Token จะเก่า)
      const fullUserData = await UserService.getUserById(payload.id);

      if (!fullUserData) {
        set.status = 404;
        return { success: false, message: "User not found in database" };
      }

      // 3. 🔒 ตัด Password ทิ้งเพื่อความปลอดภัย
      const { password, ...safeUser } = fullUserData;

      // 4. ส่งข้อมูลตัวเต็มกลับไป
      return { success: true, user: safeUser };

    } catch (error) {
      console.error("Database Error:", error);
      set.status = 500;
      return { success: false, message: "Internal Server Error" };
    }
  })

  // ✅ Get all users
  .get("/", async () => {
    try {
      const users = await UserService.getAllUsers();
      return users;
    } catch (error) {
      console.error(error);
      throw new Error("Failed to fetch users");
    }
  })

  // ✅ Get user by UUID
  .get(
    "/:uuid",
    async ({ params }) => {
      try {
        const user = await UserService.getUserById(String(params.uuid));
        if (!user) throw new Error("User not found");
        return user;
      } catch (error) {
        console.error(error);
        throw new Error("Failed to fetch user");
      }
    },
    {
      params: t.Object({
        uuid: t.String(),
      }),
    },
  )

  // ✅ Create user + send verification email
  // .post(
  //   "/",
  //   async ({ body, set }) => {
  //     try {
  //       console.log("➡️ Starting user creation process...");

  //       // Hash password
  //       const salt = await bcrypt.genSalt(10);
  //       const hashedPassword = await bcrypt.hash(body.password, salt);

  //       // Prepare payload
  //       const newUserPayload = {
  //         ...body,
  //         password: hashedPassword,
  //       } as CreateUserInput;

  //       // Create user
  //       const newUserId = await UserService.createUser(newUserPayload);
  //       console.log("✅ Created user:", newUserId);

  //       // Create verification token
  //       const token = await EmailVerification.create(newUserId);
  //       console.log("✅ Created verification token:", token);

  //       // Send verification email
  //       await EmailVerification.sendVerifyEmail(body.email, token);
  //       console.log("✅ Sent verification email");

  //       set.status = 201;
  //       return {
  //         success: true,
  //         message: "User created and verification email sent",
  //         user_id: newUserId,
  //       };
  //     } catch (error) {
  //       console.error("❌ Error creating user or sending email:", error);

  //       // ตรวจแยกกรณีอีเมลซ้ำโดยเฉพาะ
  //       const message = error instanceof Error ? error.message : String(error);

  //       if (message === "อีเมลนี้มีอยู่แล้ว") {
  //         set.status = 400;
  //         return {
  //           success: false,
  //           message: "อีเมลนี้มีอยู่แล้ว",
  //         };
  //       }

  //       set.status = 500;
  //       return {
  //         success: false,
  //         message: "Failed to create user or send verification email",
  //         error: message,
  //       };
  //     }
  //   },
  //   {
  //     body: t.Object({
  //       username: t.String({ minLength: 3 }),
  //       email: t.String({ format: "email" }),
  //       password: t.String({ minLength: 6 }),
  //       role: t.Optional(t.String()),
  //       phone: t.Optional(t.String()),
  //       is_active: t.Optional(t.Number()),
  //     }),
  //   },
  // )

  // ✅ Create user + send verification email
.post(
  "/",
  async ({ body, set }) => {
    try {
      console.log("➡️ Starting user creation process...");

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(body.password, salt);

      // Prepare payload
      const newUserPayload = {
        ...body,
        password: hashedPassword,
      } as CreateUserInput;

      // Create user
      const newUserId = await UserService.createUser(newUserPayload);
      console.log("✅ Created user:", newUserId);

      // Create verification token
      const token = await EmailVerification.create(newUserId);
      console.log("✅ Created verification token:", token);

      // Send verification email
      await EmailVerification.sendVerifyEmail(body.email, token);
      console.log("✅ Sent verification email");

      // 🆕 ส่งแจ้งเตือนไปที่ LINE OA
      await sendLineNotification(
        `🎉 มีผู้ใช้ใหม่สมัครใช้งาน PetTerrain\n👤 ${body.username}\n📧 ${body.email}`
      );

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
        return {
          success: false,
          message: "อีเมลนี้มีอยู่แล้ว",
        };
      }

      set.status = 500;
      return {
        success: false,
        message: "Failed to create user or send verification email",
        error: message,
      };
    }
  },
  {
    body: t.Object({
      username: t.String({ minLength: 3 }),
      email: t.String({ format: "email" }),
      password: t.String({ minLength: 6 }),
      role: t.Optional(t.String()),
      phone: t.Optional(t.String()),
      is_active: t.Optional(t.Number()),
    }),
  },
)

  .get(
    "/check-verified",
    async ({ query, set }) => {
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
    },
    {
      query: t.Object({
        email: t.String({ format: "email" }),
      }),
    },
  )

  // ✅ Update user (partial)
  .put(
    "/:id",
    async ({ params, body, request, jwt, set }) => {
      try {
        // 1. ตรวจสอบ Token
        const currentUser = await AuthGuard.validate(request, jwt);
        if (!currentUser) {
          set.status = 401;
          return { success: false, message: "Unauthorized" };
        }

        // 2. Authorization: เช็คว่าเป็นเจ้าของบัญชี หรือเป็น Admin หรือไม่
        // (ป้องกัน User A แอบแก้ข้อมูล User B)
        if (currentUser.id !== params.id && currentUser.role !== "admin" && currentUser.role !== "super_admin") {
          set.status = 403;
          return { success: false, message: "Forbidden: You can only update your own account" };
        }

        // 3. ทำการ Update
        const ok = await UserService.updateUser(params.id, body);
        if (!ok) {
            set.status = 404;
            return { success: false, message: "User not found or no changes made" };
        }

        // 4. ✅ บันทึก Activity Log
        await LogService.createLog({
          user_id: currentUser.id, // ใครเป็นคนทำรายการ
          action: "UPDATE_USER",
          entity_type: "USER",
          entity_id: params.id, // แก้ข้อมูลของใคร
          details: { 
            message: "Updated user profile", 
            fields_updated: Object.keys(body) // บันทึกว่าแก้ field ไหนบ้าง
          },
          ip_address: request.headers.get("x-forwarded-for") || "unknown",
          user_agent: request.headers.get("user-agent") || "unknown",
        });

        return { success: true, message: "User updated successfully" };

      } catch (error) {
        console.error("Update Error:", error);
        set.status = 500;
        return {
          success: false,
          message: "Failed to update user",
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
    {
      params: t.Object({
        id: t.String(), // ✅ ใช้ String เพราะเป็น UUID
      }),
      body: t.Partial(
        t.Object({
          username: t.String({ minLength: 3 }),
          first_name: t.String(),
          last_name: t.String(),
          phone: t.String(),
          // ตัด field sensitive เช่น role, password ออกจาก route นี้ (ควรแยก route หรือ check admin)
          is_active: t.Optional(t.Number()), 
        }),
      ),
    },
  )

  // ✅ Update password (with old password check)
.put(
  "/:id/password",
  async ({ params, body, request, jwt, set }) => {
    try {
      // 1. ตรวจสอบ Token
      const currentUser = await AuthGuard.validate(request, jwt);
      if (!currentUser) {
        set.status = 401;
        return { success: false, message: "Unauthorized" };
      }

      // 2. Authorization
      if (
        currentUser.id !== params.id &&
        currentUser.role !== "admin" &&
        currentUser.role !== "super_admin"
      ) {
        set.status = 403;
        return { success: false, message: "Forbidden" };
      }

      // 3. ✅ ดึงข้อมูล user ปัจจุบันจาก database
      const existingUser = await UserService.getUserById(params.id);
      if (!existingUser) {
        set.status = 404;
        return { success: false, message: "User not found" };
      }

      // 4. ✅ ตรวจสอบรหัสผ่านเดิม (จำเป็นต้องส่งมาจาก frontend)
      const match = await bcrypt.compare(body.oldPassword, existingUser.password);
      if (!match) {
        set.status = 400;
        return { success: false, message: "รหัสผ่านเดิมไม่ถูกต้อง" };
      }

      // 5. ✅ Hash รหัสผ่านใหม่
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(body.newPassword, salt);

      // 6. ✅ อัปเดตรหัสผ่านใหม่
      const ok = await UserService.updatePassword(params.id, hashedPassword);
      if (!ok) {
        set.status = 404;
        return { success: false, message: "User not found" };
      }

      // 7. 📝 บันทึก Log
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
      return {
        success: false,
        message: "Failed to update password",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
  {
    params: t.Object({
      id: t.String(),
    }),
    body: t.Object({
      oldPassword: t.String({ minLength: 6 }), // ✅ รหัสผ่านเดิม
      newPassword: t.String({ minLength: 6 }), // ✅ รหัสผ่านใหม่
    }),
  },
)

  // ✅ Activate/Deactivate user
  .patch(
    "/:id/active",
    async ({ params, body, request, jwt, set }) => {
        try {
            // 1. ตรวจสอบว่าเป็น Admin หรือไม่
            const adminUser = await AuthGuard.validateAdmin(request, jwt);
            if (!adminUser) {
                set.status = 403;
                return { success: false, message: "Forbidden: Admin access required" };
            }

            // 2. Update status
            const ok = await UserService.setActive(params.id, body.is_active);
            if (!ok) throw new Error("User not found");

            // 3. ✅ Log
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
    },
    {
      params: t.Object({
        id: t.String(), // UUID
      }),
      body: t.Object({
        is_active: t.Number(),
      }),
    },
  )

  // ✅ Delete user
  .delete(
    "/:id",
    async ({ params, request, jwt, set }) => {
      try {
        // 1. 🔒 Security: ตรวจสอบว่าเป็น Admin เท่านั้น!
        // (การลบ User อันตรายมาก ไม่ควรให้ User ทั่วไปทำได้)
        const adminUser = await AuthGuard.validateAdmin(request, jwt);
        
        if (!adminUser) {
          set.status = 403;
          return { success: false, message: "Forbidden: Admin access required" };
        }

        // 2. 🗑️ Perform Delete
        // ❌ ไม่ต้องแปลง Number() แล้ว เพราะ ID เป็น UUID String
        const ok = await UserService.deleteUser(params.id);
        
        if (!ok) {
           set.status = 404;
           return { success: false, message: "User not found" };
        }

        // 3. 📝 Activity Log
        await LogService.createLog({
          user_id: adminUser.id, // ใครเป็นคนกดลบ (Admin)
          action: "DELETE_USER",
          entity_type: "USER",
          entity_id: params.id,  // ลบ User ID ไหนไป
          details: `User deleted by Admin`,
          ip_address: request.headers.get("x-forwarded-for") || "unknown",
          user_agent: request.headers.get("user-agent") || "unknown",
        });

        return { success: true, message: "User deleted successfully" };

      } catch (error) {
        console.error("Delete Error:", error);
        set.status = 500;
        return {
          success: false,
          message: "Failed to delete user",
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
    {
      params: t.Object({
        id: t.String(), // ✅ แก้จาก t.Number() เป็น t.String() รองรับ UUID
      }),
    },
  );

export default userController;
