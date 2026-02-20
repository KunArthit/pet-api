import { Elysia, t } from "elysia";
import ProductClass from "../classes/ProductClass";
import ImageService from "../classes/ProductImagesClass"; // ตรวจสอบชื่อไฟล์ให้ตรง
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
      const productId = Number(params.id);
      const product = await ProductService.getProductById(productId);
      
      if (!product) {
        set.status = 404;
        return { success: false, message: "Product not found" };
      }

      // ดึงรูปภาพทั้งหมดของสินค้า
      const images = await ImageService.getImagesByProductId(productId);

      return { 
        success: true, 
        data: { 
          ...product, 
          gallery: images 
        } 
      };
    },
    {
      params: t.Object({ id: t.String() }),
    }
  )

  // --- พื้นที่ต้อง Login / Admin ---
  .use(authGuard)

  // 3. Create Product (แก้ไข Logic ให้รองรับ Gallery Images)
  .post(
    "/",
    async ({ body, set }) => {
      try {
        // ขั้นตอนที่ 1: สร้างสินค้าตัวหลัก
        const productId = await ProductService.createProduct({
          name: body.name,
          slug: body.slug,
          sku: body.sku,
          category_id: body.category_id,
          description: body.description,
          price: body.price,
          stock_quantity: body.stock_quantity || 0,
          image_url: body.image_url,
          is_active: body.is_active ?? 1,
        });

        // ขั้นตอนที่ 2: ถ้ามี gallery_images ส่งมา ให้นำไปบันทึกในตาราง product_images
        if (body.gallery_images && Array.isArray(body.gallery_images)) {
          const imagePromises = body.gallery_images.map((url, index) => 
            ImageService.createImage({
              product_id: productId,
              image_url: url,
              sort_order: index, // เรียงตามลำดับใน Array
            })
          );
          await Promise.all(imagePromises);
        }

        return {
          success: true,
          message: "Product and gallery created",
          product_id: productId,
        };
      } catch (error) {
        console.error("Create Product Error:", error);
        set.status = 500;
        return { success: false, message: "Failed to create product" };
      }
    },
    {
      body: t.Object({
        name: t.String(),
        slug: t.String(),
        sku: t.Optional(t.String()),
        category_id: t.Number(),
        description: t.Optional(t.String()),
        price: t.Number(),
        stock_quantity: t.Optional(t.Number()),
        image_url: t.Optional(t.String()),
        is_active: t.Optional(t.Number()),
        gallery_images: t.Optional(t.Array(t.String())),
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

  // 5. Delete Product
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

  // 6. เพิ่มรูป Gallery ทีละรูป (เผื่อใช้ในหน้าแก้ไข)
  .post(
    "/:id/images",
    async ({ params, body, set }) => {
      try {
        const newImageId = await ImageService.createImage({
          product_id: Number(params.id),
          image_url: body.image_url,
          sort_order: body.sort_order || 0
        });

        return { 
          success: true, 
          message: "Image added to gallery", 
          image_id: newImageId 
        };
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

  // 7. ลบรูป Gallery ตาม imageId
  .delete(
    "/images/:imageId",
    async ({ params, set }) => {
      try {
        const success = await ImageService.deleteImage(Number(params.imageId));
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