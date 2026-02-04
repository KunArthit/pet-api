// src/controllers/CategoryController.ts
import { Elysia, t } from "elysia";
import CategoryClass from "../classes/CategoryClass";
import { authGuard } from "../middlewares/authMiddleware"; // ✅ นำเข้า Guard ที่คุณทำไว้

const CategoryService = new CategoryClass();

const categoryController = new Elysia({
  prefix: "/categories",
  tags: ["Categories"],
})
  // ---------------------------------------------
  // 🔓 Public Routes (ใครๆ ก็ดึงข้อมูลหมวดหมู่ได้)
  // ---------------------------------------------
  
  // 1. ดึงหมวดหมู่ทั้งหมด
  .get("/", async () => {
    const categories = await CategoryService.getAllCategories(true); // true = เอาเฉพาะ is_active=1
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
  .use(authGuard) // เรียกใช้ Middleware ตรวจ Token
  
  // 3. สร้างหมวดหมู่ใหม่
  .post(
    "/",
    async ({ body, set }) => { // ใส่ isAdmin(true) ใน Macro ได้ถ้าต้องการ
      try {
        const newId = await CategoryService.createCategory(body);
        set.status = 201;
        return { success: true, message: "Category created", id: newId };
      } catch (error: any) {
        // เช็ค Error ชื่อซ้ำ (Duplicate Slug/Name)
        if (error.code === 'ER_DUP_ENTRY') {
            set.status = 400;
            return { success: false, message: "ชื่อหมวดหมู่หรือ Slug ซ้ำกัน" };
        }
        throw error;
      }
    },
    {
      body: t.Object({
        name: t.String(),
        parent_id: t.Optional(t.Nullable(t.Number())), // ส่ง null ได้
        slug: t.Optional(t.String()),
        image_url: t.Optional(t.String()),
        is_active: t.Optional(t.Number()) // 0, 1
      }),
      // เรียกใช้ Macro เช็คสิทธิ์ (จาก authMiddleware ของคุณ)
      isAdmin: true 
    }
  )

  // 4. แก้ไขหมวดหมู่
  .put(
    "/:id",
    async ({ params: { id }, body, set }) => {
      const success = await CategoryService.updateCategory(Number(id), body);
      
      if (!success) {
        set.status = 404; // หรือ 400
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
        is_active: t.Optional(t.Number())
      }),
      isAdmin: true
    }
  )

  // 5. ลบหมวดหมู่
  .delete(
    "/:id",
    async ({ params: { id }, set }) => {
      const success = await CategoryService.deleteCategory(Number(id));
      
      if (!success) {
        set.status = 404;
        return { success: false, message: "Delete failed" };
      }
      
      return { success: true, message: "Category deleted" };
    },
    {
      isAdmin: true
    }
  );

export default categoryController;