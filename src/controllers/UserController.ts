// UserController.ts
import { Elysia, t } from "elysia";
import bcrypt from "bcryptjs";

// ✅ ปรับ path ให้ตรงโปรเจกต์คุณ
import UserClass from "../classes/UserClass";
import { UserModel } from "../models/UserModel";

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
  // Get all users
  .get("/", async () => {
    try {
      const users = await UserService.getAllUsers();
      console.log(users);

      return users;
    } catch (error) {
      console.error(error);
      throw new Error("Failed to fetch users");
    }
  })

  // Get user by ID
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

  // Get user with relations by ID (optional)
  // .get(
  //   "/:id/with-relations",
  //   async ({ params }) => {
  //     try {
  //       const user = await UserService.getUserWithRelationsById(
  //         Number(params.id)
  //       );
  //       if (!user) throw new Error("User not found");
  //       return user;
  //     } catch (error) {
  //       console.error(error);
  //       throw new Error("Failed to fetch user");
  //     }
  //   },
  //   {
  //     params: t.Object({
  //       id: t.Number(),
  //     }),
  //   }
  // )

  // Create user
  // .post(
  //   "/",
  //   async ({ body }) => {
  //     try {
  //       const insertId = await UserService.createUser(body);
  //       return {
  //         message: "User created successfully",
  //         user_id: insertId,
  //       };
  //     } catch (error) {
  //       console.error(error);
  //       throw new Error("Failed to create user");
  //     }
  //   },
  //   {
  //     body: t.Object({
  //       username: t.String({ minLength: 3 }),
  //       email: t.String({ format: "email" }),
  //       password: t.String({ minLength: 6 }),
  //       first_name: t.String(),
  //       last_name: t.String(),
  //       phone: t.String(),
  //       user_type_id: t.Number(),
  //       department_id: t.Number(),
  //       company_name: t.String(),
  //       tax_id: t.String(),
  //       is_active: t.Number(),
  //     }),
  //   }
  // )

  .post(
    "/",
    async ({ body, set }) => {
      try {
        // 1. Hash Password ก่อนส่งให้ Service
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(body.password, salt);

        // 2. เตรียมข้อมูล (Override password เดิมด้วย hash)
        const newUserPayload = {
          ...body,
          password: hashedPassword,
        } as CreateUserInput;

        // 3. เรียก Service (จะได้ return เป็น UUID string)
        const newUserId = await UserService.createUser(newUserPayload);

        set.status = 201; // Created
        return {
          message: "User created successfully",
          user_id: newUserId, // ✅ เป็น UUID string
        };
      } catch (error) {
        console.error(error);
        set.status = 500;
        throw new Error("Failed to create user");
      }
    },
    {
      // ✅ Schema ตรงกับ DB ล่าสุด
      body: t.Object({
        username: t.String({ minLength: 3 }),
        email: t.String({ format: "email" }),
        password: t.String({ minLength: 6 }),
        role: t.Optional(t.String()), // ส่งหรือไม่ส่งก็ได้ (Class มี default)
        phone: t.Optional(t.String()), // ส่งหรือไม่ส่งก็ได้
        is_active: t.Optional(t.Number()), // ส่งหรือไม่ส่งก็ได้
      }),
    }
  )

  // Update user (partial)
  .put(
    "/:id",
    async ({ params, body }) => {
      try {
        const ok = await UserService.updateUser(Number(params.id), body);
        if (!ok) throw new Error("User not found or no fields to update");
        return { message: "User updated successfully" };
      } catch (error) {
        console.error(error);
        throw new Error("Failed to update user");
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

  // Update password
  .put(
    "/:id/password",
    async ({ params, body }) => {
      try {
        const ok = await UserService.updatePassword(
          Number(params.id),
          body.password
        );
        if (!ok) throw new Error("User not found");
        return { message: "Password updated successfully" };
      } catch (error) {
        console.error(error);
        throw new Error("Failed to update password");
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

  // Activate/Deactivate
  .patch(
    "/:id/active",
    async ({ params, body }) => {
      try {
        const ok = await UserService.setActive(
          Number(params.id),
          body.is_active
        );
        if (!ok) throw new Error("User not found");
        return { message: "User active status updated successfully" };
      } catch (error) {
        console.error(error);
        throw new Error("Failed to update active status");
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

  // Delete user
  .delete(
    "/:id",
    async ({ params }) => {
      try {
        const ok = await UserService.deleteUser(Number(params.id));
        if (!ok) throw new Error("User not found");
        return { message: "User deleted successfully" };
      } catch (error) {
        console.error(error);
        throw new Error("Failed to delete user");
      }
    },
    {
      params: t.Object({
        id: t.Number(),
      }),
    }
  );

export default userController;
