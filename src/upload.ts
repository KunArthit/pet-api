// import { Elysia, t } from "elysia";
// import { existsSync, mkdirSync, writeFileSync } from "fs";
// import path from "path";
// import { promises as fs } from "fs";

// export const uploadRoute = new Elysia({ prefix: "/upload" })
//   .post(
//     "/",
//     async ({ body, set }) => {
//       try {
//         const file = body.file;
//         if (!file) {
//           set.status = 400;
//           return { success: false, message: "Missing file" };
//         }

//         const uploadsDir = path.join(process.cwd(), "uploads");
//         if (!existsSync(uploadsDir)) mkdirSync(uploadsDir);

//         const fileName = `${Date.now()}-${file.name}`;
//         const filePath = path.join(uploadsDir, fileName);
//         const buffer = Buffer.from(await file.arrayBuffer());
//         writeFileSync(filePath, buffer);

//         const url = `/uploads/${fileName}`;
//         return { success: true, url };
//       } catch (err) {
//         console.error("Upload failed:", err);
//         set.status = 500;
//         return { success: false, message: "Upload failed" };
//       }
//     },
//     {
//       body: t.Object({ file: t.File() }),
//     }
//   );

import { Elysia, t } from "elysia";
import { existsSync, mkdirSync, writeFileSync, chmodSync } from "fs";
import path from "path";

export const uploadRoute = new Elysia({ prefix: "/upload" })
  .post(
    "/",
    async ({ body, set }) => {
      try {
        const file = body.file;
        if (!file) {
          set.status = 400;
          return { success: false, message: "Missing file" };
        }

        // ✅ ใช้ path absolute ตรงกับ container จริง
        const uploadsDir = "/app/uploads";

        // ✅ สร้างโฟลเดอร์ถ้ายังไม่มี
        if (!existsSync(uploadsDir)) {
          mkdirSync(uploadsDir, { recursive: true });
          chmodSync(uploadsDir, 0o777); // ป้องกันสิทธิ์หาย
        }

        // ✅ สร้างชื่อไฟล์ใหม่
        const fileName = `${Date.now()}-${file.name}`;
        const filePath = path.join(uploadsDir, fileName);

        // ✅ เขียนไฟล์ลง container
        const buffer = Buffer.from(await file.arrayBuffer());
        writeFileSync(filePath, buffer);

        console.log(`📸 Uploaded: ${fileName} → ${filePath}`);

        // ✅ คืน URL ให้ frontend
        const url = `/uploads/${fileName}`;
        return { success: true, url };
      } catch (err) {
        console.error("Upload failed:", err);
        set.status = 500;
        return { success: false, message: "Upload failed" };
      }
    },
    {
      body: t.Object({ file: t.File() }),
    }
  );