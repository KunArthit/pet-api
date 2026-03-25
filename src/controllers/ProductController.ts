// src/controllers/ProductController.ts
import { Elysia, t } from "elysia";
import ProductClass from "../classes/ProductClass";
import ProductImagesClass from "../classes/ProductImagesClass"; 
import { authGuard } from "../middlewares/authMiddleware";
import sharp from "sharp";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import { unlink } from "fs/promises"; // นำเข้า unlink สำหรับลบไฟล์จริง

const ProductService = new ProductClass();
const ImageService = new ProductImagesClass();

// ==========================================
// 📸 Helper Function: บีบอัดรูปภาพด้วย sharp (ปรับ Path และชื่อไฟล์ใหม่)
// ==========================================
async function uploadAndCompressImage(file: File, prefix: string = "product"): Promise<string> {
  // ✅ 1. ย้ายมาเก็บที่โฟลเดอร์ uploads ชั้นนอกสุด (ไม่แยกโฟลเดอร์ products แล้ว)
  const uploadDir = join(process.cwd(), "public", "uploads");
  if (!existsSync(uploadDir)) {
    mkdirSync(uploadDir, { recursive: true });
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const timestamp = Date.now();
  
  // ✅ 2. ดึงชื่อไฟล์ดั้งเดิม (ถ้าไม่มีให้ใช้ prefix แทน)
  const originalName = file.name ? file.name.split('.')[0] : prefix;
  
  // ✅ 3. ตั้งชื่อไฟล์ใหม่ตาม format: 1772694021886-ชื่อไฟล์เดิม.webp
  const fileName = `${timestamp}-${originalName}.webp`; 
  const uploadPath = join(uploadDir, fileName);

  await sharp(buffer)
    .resize(800, 800, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(uploadPath);

  // ✅ 4. คืนค่า URL เป็นรูปแบบ /uploads/177...-filename.webp
  return `/uploads/${fileName}`;
}

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

  // ------------------------------------------
  // 🔒 โซน Admin (ต้อง Login)
  // ------------------------------------------
  .use(authGuard)

  // ==========================================
  // 👑 3. Create Product (สร้างพร้อมอัปโหลดรูป)
  // ==========================================
  .post("/", async ({ body, set }) => {
    try {
      let mainImageUrl = null;

      if (body.image && body.image.size > 0) {
        mainImageUrl = await uploadAndCompressImage(body.image as File, "prod_main");
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

      if (body.gallery_images) {
        // เผื่อกรณีส่งมาไฟล์เดียว (Elysia อาจมองไม่เป็น Array)
        const galleryFiles = Array.isArray(body.gallery_images) ? body.gallery_images : [body.gallery_images];
        
        for (let i = 0; i < galleryFiles.length; i++) {
          const file = galleryFiles[i] as File;
          if (file.size > 0) {
            const galleryUrl = await uploadAndCompressImage(file, `prod_gal_${productId}`);
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
  // 👑 4. Update Product
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

      if (body.image && body.image.size > 0) {
        // รูปหลักเปลี่ยนได้เลย ไฟล์เก่าทิ้งไว้ให้ Order Snapshot
        updateData.image_url = await uploadAndCompressImage(body.image as File, "prod_main");
      } else if (body.image_url !== undefined) {
        // ✅ รับค่า image_url ตรงๆ (เช่น "" เพื่อ clear รูปปก)
        updateData.image_url = body.image_url;
      }

      // ล้างค่าที่ไม่ได้ส่งมาออก
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
      category_id: t.Optional(t.Numeric()),
      description: t.Optional(t.String()),
      price: t.Optional(t.Numeric()),
      stock_quantity: t.Optional(t.Numeric()),
      is_active: t.Optional(t.Numeric()),
      image: t.Optional(t.File()),
      image_url: t.Optional(t.String()), // ✅ รับ "" เพื่อ clear รูปปก
    }),
  })

  // ==========================================
  // 💀 5. Delete Product (Hard Delete + ล้างไฟล์ขยะ)
  // ==========================================
  .delete("/:id", async ({ params, set }) => {
    try {
      const { success, galleryUrls } = await ProductService.deleteProduct(Number(params.id));
      
      if (!success) {
          set.status = 404;
          return { success: false, message: "Product not found" };
      }

      // 🧹 ลบไฟล์แกลเลอรีทิ้งจาก Server (รูปหลักรอด เพราะไม่ถูกส่งมาในนี้)
      for (const url of galleryUrls) {
        if (url) {
          // url ตอนนี้เป็น /uploads/177...webp โค้ดด้านล่างจะวิ่งไปลบได้ถูกต้องครับ
          const filePath = join(process.cwd(), "public", url);
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

      const imageUrl = await uploadAndCompressImage(body.image as File, "prod_gal");

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
      image: t.File(), 
      sort_order: t.Optional(t.Numeric()),
    }),
  })

  // ==========================================
  // 💀 7. ลบรูป Gallery ตาม imageId (ลบไฟล์จริงด้วย!)
  // ==========================================
  .delete("/images/:imageId", async ({ params, set }) => {
    try {
      const deletedUrl = await ImageService.deleteImage(Number(params.imageId));
      
      if(!deletedUrl) {
          set.status = 404;
          return { success: false, message: "Image not found" };
      }

      // 🧹 ตามไปลบไฟล์จริงออกจาก Server ทันที
      const filePath = join(process.cwd(), "public", deletedUrl);
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