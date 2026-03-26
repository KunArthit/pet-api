// src/controllers/ProductController.ts
import { Elysia, t } from "elysia";
import ProductClass from "../classes/ProductClass";
import ProductImagesClass from "../classes/ProductImagesClass"; 
import { authGuard } from "../middlewares/authMiddleware";
import { join } from "path";
import { unlink } from "fs/promises";
import { processAndSaveFile } from "../upload"; // ✅ นำเข้าจาก upload.ts

const ProductService = new ProductClass();
const ImageService = new ProductImagesClass();

const productController = new Elysia({
  prefix: "/products",
  tags: ["Products"],
})
  // ==========================================
  // 🔓 1. Get All Products
  // ==========================================
  .get("/", async ({ query }) => {
    const products = await ProductService.getAllProducts({
      limit: query.limit ? Number(query.limit) : 20,
      offset: query.offset ? Number(query.offset) : 0,
      search: query.search,
      categoryId: query.category_id ? Number(query.category_id) : undefined,
    });
    return { success: true, data: products };
  }, {
    query: t.Object({
      limit: t.Optional(t.String()),
      offset: t.Optional(t.String()),
      search: t.Optional(t.String()),
      category_id: t.Optional(t.String()),
    }),
  })

  // ==========================================
  // 🔓 2. Get Product Detail
  // ==========================================
  .get("/:id", async ({ params, set }) => {
    const productId = Number(params.id);
    const product = await ProductService.getProductById(productId);
    
    if (!product) {
      set.status = 404;
      return { success: false, message: "Product not found" };
    }

    const images = await ImageService.getImagesByProductId(productId);
    return { success: true, data: { ...product, gallery: images } };
  }, {
    params: t.Object({ id: t.String() }),
  })

  .use(authGuard)

  // ==========================================
  // 👑 3. Create Product
  // ==========================================
  .post("/", async ({ body, set }) => {
    try {
      let mainImageUrl = null;

      // ✅ 1. นำไฟล์รูปปกส่งเข้าท่อ processAndSaveFile
      if (body.image && body.image.size > 0) {
        mainImageUrl = await processAndSaveFile(body.image as File);
      }

      const productId = await ProductService.createProduct({
        name: body.name,
        slug: body.slug,
        sku: body.sku,
        category_id: body.category_id,
        description: body.description,
        price: body.price,
        stock_quantity: body.stock_quantity || 0,
        image_url: mainImageUrl,
        is_active: body.is_active ?? 1,
      });

      // ✅ 2. นำไฟล์รูปแกลเลอรีส่งเข้าท่อ processAndSaveFile
      if (body.gallery_images) {
        const galleryFiles = Array.isArray(body.gallery_images) ? body.gallery_images : [body.gallery_images];
        for (let i = 0; i < galleryFiles.length; i++) {
          const file = galleryFiles[i] as File;
          if (file.size > 0) {
            const galleryUrl = await processAndSaveFile(file);
            await ImageService.createImage({
              product_id: productId,
              image_url: galleryUrl,
              sort_order: i,
            });
          }
        }
      }

      set.status = 201;
      return { success: true, message: "Product created successfully", product_id: productId };
    } catch (error) {
      console.error("Create Product Error:", error);
      set.status = 500;
      return { success: false, message: "Failed to create product" };
    }
  }, {
    // ⚠️ กลับมารับ File เพื่อรองรับ Form Data จากหน้าบ้าน
    body: t.Object({
      name: t.String(),
      slug: t.Optional(t.String()),
      sku: t.Optional(t.String()),
      category_id: t.Numeric(), 
      description: t.Optional(t.String()),
      price: t.Numeric(),
      stock_quantity: t.Optional(t.Numeric()),
      is_active: t.Optional(t.Numeric()),
      image: t.Optional(t.File()), 
      gallery_images: t.Optional(t.Any()), 
    }),
  })

  // ==========================================
  // 👑 4. Update Product (แก้ 500 Error ตรงนี้)
  // ==========================================
  .put("/:id", async ({ params, body, set }) => {
    try {
      const updateData: any = {
        name: body.name,
        slug: body.slug,
        sku: body.sku,
        category_id: body.category_id,
        description: body.description,
        price: body.price,
        stock_quantity: body.stock_quantity,
        is_active: body.is_active,
      };

      // ✅ จัดการรูป: ถ้ามีไฟล์มา ให้เซฟไฟล์ใหม่ ถ้ามี URL เปล่าๆ มา ให้เคลียร์รูป
      if (body.image && body.image.size > 0) {
        updateData.image_url = await processAndSaveFile(body.image as File);
      } else if (body.image_url !== undefined) {
        updateData.image_url = body.image_url;
      }

      // ล้างข้อมูลที่ไม่ได้ส่งมา
      Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

      const success = await ProductService.updateProduct(Number(params.id), updateData);
      if (!success) throw new Error("Update failed or product not found");

      return { success: true, message: "Product updated successfully" };
    } catch (error) {
      set.status = 500;
      return { success: false, message: (error as Error).message };
    }
  }, {
    params: t.Object({ id: t.String() }),
    body: t.Object({
      name: t.Optional(t.String()),
      slug: t.Optional(t.String()),
      sku: t.Optional(t.String()),
      category_id: t.Optional(t.Numeric()), // ⚠️ บังคับแปลง String จาก FormData เป็น Number
      description: t.Optional(t.String()),
      price: t.Optional(t.Numeric()),
      stock_quantity: t.Optional(t.Numeric()),
      is_active: t.Optional(t.Numeric()),
      image: t.Optional(t.File()), // ✅ ยอมรับไฟล์ (ที่เห็นในรูป payload)
      image_url: t.Optional(t.String()), 
    }),
  })

  // ==========================================
  // 💀 5. Delete Product
  // ==========================================
  .delete("/:id", async ({ params, set }) => {
    try {
      const { success, galleryUrls } = await ProductService.deleteProduct(Number(params.id));
      if (!success) {
          set.status = 404;
          return { success: false, message: "Product not found" };
      }

      for (const url of galleryUrls) {
        if (url) {
          const filePath = join("/app", url); 
          await unlink(filePath).catch(() => console.log("File not found, skipping:", url));
        }
      }
      return { success: true, message: "Product deleted and gallery files removed" };
    } catch (error) {
      set.status = 500;
      return { success: false, message: "Delete failed" };
    }
  }, {
    params: t.Object({ id: t.String() }),
  })

  // ==========================================
  // 👑 6. เพิ่มรูป Gallery ทีละรูป (หน้าแก้ไข)
  // ==========================================
  .post("/:id/images", async ({ params, body, set }) => {
    try {
      if (!body.image || body.image.size === 0) {
        set.status = 400;
        return { success: false, message: "No image file provided" };
      }

      // ✅ นำไฟล์เข้าท่อประมวลผล
      const imageUrl = await processAndSaveFile(body.image as File);

      const newImageId = await ImageService.createImage({
        product_id: Number(params.id),
        image_url: imageUrl,
        sort_order: body.sort_order || 0
      });

      return { success: true, message: "Image added to gallery", image_id: newImageId };
    } catch (error) {
      set.status = 500;
      return { success: false, message: "Failed to add image" };
    }
  }, {
    params: t.Object({ id: t.String() }),
    body: t.Object({
      image: t.File(), // ✅ กลับมารับ File ตรงๆ
      sort_order: t.Optional(t.Numeric()),
    }),
  })

  // ==========================================
  // 💀 7. ลบรูป Gallery ตาม imageId
  // ==========================================
  .delete("/images/:imageId", async ({ params, set }) => {
    try {
      const deletedUrl = await ImageService.deleteImage(Number(params.imageId));
      if(!deletedUrl) {
          set.status = 404;
          return { success: false, message: "Image not found" };
      }
      const filePath = join("/app", deletedUrl);
      await unlink(filePath).catch(() => console.log("Physical file not found:", deletedUrl));

      return { success: true, message: "Image removed from gallery and server" };
    } catch (error) {
      set.status = 500;
      return { success: false, message: "Failed to remove image" };
    }
  }, {
    params: t.Object({ imageId: t.String() })
  });

export default productController;