// src/controllers/CategoryController.ts
import { Elysia, t } from "elysia";
import CategoryClass from "../classes/CategoryClass";
import { authGuard } from "../middlewares/authMiddleware"; // ✅ นำเข้า Guard ของคุณ
import { jwtPlugin } from "../utils/jwt-plugin"; // 🆕 นำเข้า jwtPlugin เพื่อถอดรหัส

const CategoryService = new CategoryClass();

const CategoryController = new Elysia({
  prefix: "/categories",
  tags: ["Categories"],
})
  .use(jwtPlugin) // ✅ เรียกใช้ jwtPlugin ตรงนี้เพื่อใช้ในการอ่านค่า Header

  // ---------------------------------------------
  // 🔓 Public Routes (แต่จะแอบเช็คสิทธิ์ถ้ามี Token ส่งมา)
  // ---------------------------------------------

  // 1. ดึงหมวดหมู่ทั้งหมด
  .get("/", async ({ request, jwt }) => {
    let isAdmin = false;

    // 🕵️‍♂️ ลองดึง Token จาก Header มาเช็ค
    const authHeader = request.headers.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      try {
        const decoded = await jwt.verify(token);
        // ถ้า Token ถูกต้อง และมี Role เป็นแอดมิน ให้ปรับสถานะเป็น true
        if (decoded && (decoded.role === "admin" || decoded.role === "super_admin")) {
          isAdmin = true;
        }

        console.log(isAdmin);
        
      } catch (error) {
        // ถ้า Token หมดอายุหรือไม่ถูกต้อง ก็ปล่อยผ่าน (ให้ทำตัวเหมือน Guest หรือ User ทั่วไป)
      }
    }

    // 💡 ถ้า isAdmin เป็น true จะส่งค่า false ไปหา Class (ดึงทั้งหมด)
    // 💡 ถ้า isAdmin เป็น false จะส่งค่า true ไปหา Class (ดึงเฉพาะที่ Active)
    const categories = await CategoryService.getAllCategories(!isAdmin); 
    
    return { success: true, data: categories };
  })

  // 2. ดึงหมวดหมู่ตาม ID
  .get("/:id", async ({ params: { id }, set }) => {
    const category = await CategoryService.getCategoryById(Number(id));

    if (!category) {
      set.status = 404;
      return { success: false, message: "Category not found" };
    }

    return { success: true, data: category };
  })

  // ---------------------------------------------
  // 🔒 Protected Routes (ต้อง Login และเป็น Admin)
  // ---------------------------------------------
  .use(authGuard) // Middleware ดักเส้นทางด้านล่างนี้ทั้งหมด

  // 3. สร้างหมวดหมู่ใหม่
  .post(
    "/",
    async ({ body, set }) => {
      try {
        const newId = await CategoryService.createCategory(body);
        set.status = 201;
        return { success: true, message: "Category created", id: newId };
      } catch (error: any) {
        if (error.code === "ER_DUP_ENTRY") {
          set.status = 400;
          return { success: false, message: "ชื่อหมวดหมู่หรือ Slug ซ้ำกัน" };
        }
        throw error;
      }
    },
    {
      body: t.Object({
        name: t.String(),
        parent_id: t.Optional(t.Nullable(t.Number())),
        slug: t.Optional(t.String()),
        image_url: t.Optional(t.String()),
        is_active: t.Optional(t.Number()),
      }),
      isAdmin: true,
    },
  )

  // 4. แก้ไขหมวดหมู่
  .put(
    "/:id",
    async ({ params: { id }, body, set }) => {
      const success = await CategoryService.updateCategory(Number(id), body);

      if (!success) {
        set.status = 404;
        return { success: false, message: "Update failed or ID not found" };
      }

      return { success: true, message: "Category updated" };
    },
    {
      body: t.Object({
        name: t.Optional(t.String()),
        parent_id: t.Optional(t.Nullable(t.Number())),
        slug: t.Optional(t.String()),
        image_url: t.Optional(t.String()),
        is_active: t.Optional(t.Number()),
      }),
      isAdmin: true,
    },
  )

  // 5. ลบหมวดหมู่
  .delete(
    "/:id",
    async ({ params: { id }, set }) => {
      const result = await CategoryService.deleteCategory(Number(id));

      if (!result.success) {
        set.status = 400;
        return { success: false, message: result.message };
      }

      return { success: true, message: result.message };
    },
    {
      isAdmin: true,
    },
  );

export default CategoryController;