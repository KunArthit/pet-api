import { Elysia, t } from "elysia";
import ProductClass from "../classes/ProductClass";
import { authGuard } from "../middlewares/authMiddleware";

const ProductService = new ProductClass();

const productController = new Elysia({
  prefix: "/products",
  tags: ["Products"],
})
  // 1. Get All Products (Public)
  .get(
    "/",
    async ({ query }) => {
      const products = await ProductService.getAllProducts({
        limit: query.limit ? Number(query.limit) : 20,
        offset: query.offset ? Number(query.offset) : 0,
        search: query.search,
        categoryId: query.category_id ? Number(query.category_id) : undefined,
      });
      return { success: true, data: products };
    },
    {
      query: t.Object({
        limit: t.Optional(t.String()),
        offset: t.Optional(t.String()),
        search: t.Optional(t.String()),
        category_id: t.Optional(t.String()),
      }),
    }
  )

  // 2. Get Product Detail (Public)
  .get(
    "/:id",
    async ({ params, set }) => {
      const result = await ProductService.getProductById(Number(params.id));
      if (!result) {
        set.status = 404;
        return { success: false, message: "Product not found" };
      }
      return { success: true, data: result };
    },
    {
      params: t.Object({ id: t.String() }),
    }
  )

  // --- พื้นที่ต้อง Login / Admin ---
  .use(authGuard) // เรียกใช้ Guard (Middleware)

  // 3. Create Product (Admin Only)
  .post(
    "/",
    async ({ body, set }) => {
      try {
        const productId = await ProductService.createProduct({
          ...body,
          stock_quantity: body.stock_quantity || 0,
          is_active: body.is_active ?? 1,
        });

        return {
          success: true,
          message: "Product created",
          product_id: productId,
        };
      } catch (error) {
        console.error("Create Product Error:", error);
        set.status = 500;
        return { success: false, message: "Failed to create product" };
      }
    },
    {
      // ใส่ isAdmin: true ใน macro ถ้าคุณทำไว้
      // isAdmin: true, 
      body: t.Object({
        name: t.String(),
        slug: t.String(), // หรือจะให้ Backend generate เองก็ได้
        sku: t.Optional(t.String()),
        category_id: t.Optional(t.Number()),
        description: t.Optional(t.String()),
        price: t.Number(),
        stock_quantity: t.Optional(t.Number()),
        image_url: t.Optional(t.String()), // รูปหลัก
        is_active: t.Optional(t.Number()), // 0, 1
        gallery_images: t.Optional(t.Array(t.String())), // รูปเพิ่มเติม (Array of URLs)
      }),
    }
  )

  // 4. Update Product
  .put(
    "/:id",
    async ({ params, body, set }) => {
      try {
        const success = await ProductService.updateProduct(
          Number(params.id),
          body
        );
        if (!success) throw new Error("Update failed or product not found");

        return { success: true, message: "Product updated" };
      } catch (error) {
        set.status = 500;
        return { success: false, message: (error as Error).message };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        name: t.Optional(t.String()),
        slug: t.Optional(t.String()),
        sku: t.Optional(t.String()),
        category_id: t.Optional(t.Number()),
        description: t.Optional(t.String()),
        price: t.Optional(t.Number()),
        stock_quantity: t.Optional(t.Number()),
        image_url: t.Optional(t.String()),
        is_active: t.Optional(t.Number()),
      }),
    }
  )

  // 5. Delete Product (Soft Delete)
  .delete(
    "/:id",
    async ({ params, set }) => {
      try {
        const success = await ProductService.deleteProduct(Number(params.id));
        if (!success) {
            set.status = 404;
            return { success: false, message: "Product not found" };
        }
        return { success: true, message: "Product deleted" };
      } catch (error) {
        set.status = 500;
        return { success: false, message: "Delete failed" };
      }
    },
    {
      params: t.Object({ id: t.String() }),
    }
  )

  // 6. เพิ่มรูป Gallery (ทีละรูป)
  .post(
    "/:id/images",
    async ({ params, body, set }) => {
      try {
        await ProductService.addProductImage(
          Number(params.id),
          body.image_url,
          body.sort_order || 0
        );
        return { success: true, message: "Image added to gallery" };
      } catch (error) {
        set.status = 500;
        return { success: false, message: "Failed to add image" };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        image_url: t.String(),
        sort_order: t.Optional(t.Number()),
      }),
    }
  )

  // 7. ลบรูป Gallery
  .delete(
    "/images/:imageId",
    async ({ params, set }) => {
      try {
        const success = await ProductService.deleteProductImage(Number(params.imageId));
        if(!success) {
            set.status = 404;
            return { success: false, message: "Image not found" };
        }
        return { success: true, message: "Image removed from gallery" };
      } catch (error) {
        set.status = 500;
        return { success: false, message: "Failed to remove image" };
      }
    },
    {
        params: t.Object({ imageId: t.String() })
    }
  );

export default productController;