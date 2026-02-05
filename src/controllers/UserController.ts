// controllers/UserController.ts
import { Elysia, t } from "elysia";
import bcrypt from "bcryptjs";

import UserClass from "../classes/UserClass";
import { UserModel } from "../models/UserModel";
import { EmailVerification } from "../classes/EmailVerificationClass";

const UserService = new UserClass();

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
    }
  )

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

        set.status = 201;
        return {
          success: true,
          message: "User created and verification email sent",
          user_id: newUserId,
        };
      } catch (error) {
        console.error("❌ Error creating user or sending email:", error);

        // ตรวจแยกกรณีอีเมลซ้ำโดยเฉพาะ
        const message =
          error instanceof Error ? error.message : String(error);

        if (message === "Email already exists") {
          set.status = 400;
          return {
            success: false,
            message: "Email already exists",
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
    }
  )

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
    query: t.Object({
      email: t.String({ format: "email" })
    })
  })

  // ✅ Update user (partial)
  .put(
    "/:id",
    async ({ params, body }) => {
      try {
        const ok = await UserService.updateUser(Number(params.id), body);
        if (!ok) throw new Error("User not found or no fields to update");
        return { success: true, message: "User updated successfully" };
      } catch (error) {
        console.error(error);
        return {
          success: false,
          message: "Failed to update user",
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
    {
      params: t.Object({
        id: t.Number(),
      }),
      body: t.Partial(
        t.Object({
          username: t.String({ minLength: 3 }),
          email: t.String({ format: "email" }),
          password: t.String({ minLength: 6 }),
          first_name: t.String(),
          last_name: t.String(),
          phone: t.String(),
          user_type_id: t.Number(),
          department_id: t.Number(),
          company_name: t.String(),
          tax_id: t.String(),
          is_active: t.Number(),
        })
      ),
    }
  )

  // ✅ Update password
  .put(
    "/:id/password",
    async ({ params, body }) => {
      try {
        const ok = await UserService.updatePassword(
          Number(params.id),
          body.password
        );
        if (!ok) throw new Error("User not found");
        return { success: true, message: "Password updated successfully" };
      } catch (error) {
        console.error(error);
        return {
          success: false,
          message: "Failed to update password",
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
    {
      params: t.Object({
        id: t.Number(),
      }),
      body: t.Object({
        password: t.String({ minLength: 6 }),
      }),
    }
  )

  // ✅ Activate/Deactivate user
  .patch(
    "/:id/active",
    async ({ params, body }) => {
      try {
        const ok = await UserService.setActive(
          Number(params.id),
          body.is_active
        );
        if (!ok) throw new Error("User not found");
        return { success: true, message: "User active status updated successfully" };
      } catch (error) {
        console.error(error);
        return {
          success: false,
          message: "Failed to update active status",
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
    {
      params: t.Object({
        id: t.Number(),
      }),
      body: t.Object({
        is_active: t.Number(),
      }),
    }
  )

  // ✅ Delete user
  .delete(
    "/:id",
    async ({ params }) => {
      try {
        const ok = await UserService.deleteUser(Number(params.id));
        if (!ok) throw new Error("User not found");
        return { success: true, message: "User deleted successfully" };
      } catch (error) {
        console.error(error);
        return {
          success: false,
          message: "Failed to delete user",
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
    {
      params: t.Object({
        id: t.Number(),
      }),
    }
  )

  // ✅ ตรวจสอบ username / email ซ้ำ
  .post(
  "/check-duplicate",
  async ({ body, set }) => {
    try {
      const { username, email } = body;

      // ตรวจสอบ username ซ้ำ
      const usernameExists = await UserService.existsUsername(username);
      if (usernameExists) {
        set.status = 200;
        return { duplicate: true, field: "username" };
      }

      // ตรวจสอบ email ซ้ำ
      const emailExists = await UserService.existsEmail(email);
      if (emailExists) {
        set.status = 200;
        return { duplicate: true, field: "email" };
      }

      // ถ้าไม่ซ้ำ
      return { duplicate: false };
    } catch (error) {
      console.error("❌ Error checking duplicate:", error);
      set.status = 500;
      return {
        success: false,
        message: "Failed to check duplicate",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
  {
    body: t.Object({
      username: t.String(),
      email: t.String({ format: "email" }),
    }),
  }
);

export default userController;