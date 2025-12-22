// UserController.ts
import { Elysia, t } from "elysia";

// ✅ ปรับ path ให้ตรงโปรเจกต์คุณ
import UserClass from "../classes/UserClass";

const UserService = new UserClass();

const userController = new Elysia({
  prefix: "/users",
  tags: ["Users"],
})
  // Get all users
  .get("/", async () => {
    try {
      return await UserService.getAllUsers();
    } catch (error) {
      console.error(error);
      throw new Error("Failed to fetch users");
    }
  })

  // Get user by ID
  .get(
    "/:id",
    async ({ params }) => {
      try {
        const user = await UserService.getUserById(Number(params.id));
        if (!user) throw new Error("User not found");
        return user;
      } catch (error) {
        console.error(error);
        throw new Error("Failed to fetch user");
      }
    },
    {
      params: t.Object({
        id: t.Number(),
      }),
    }
  )

  // Get user with relations by ID (optional)
  .get(
    "/:id/with-relations",
    async ({ params }) => {
      try {
        const user = await UserService.getUserWithRelationsById(
          Number(params.id)
        );
        if (!user) throw new Error("User not found");
        return user;
      } catch (error) {
        console.error(error);
        throw new Error("Failed to fetch user");
      }
    },
    {
      params: t.Object({
        id: t.Number(),
      }),
    }
  )

  // Create user
  .post(
    "/",
    async ({ body }) => {
      try {
        const insertId = await UserService.createUser(body);
        return {
          message: "User created successfully",
          user_id: insertId,
        };
      } catch (error) {
        console.error(error);
        throw new Error("Failed to create user");
      }
    },
    {
      body: t.Object({
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
        const ok = await UserService.setActive(Number(params.id), body.is_active);
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
