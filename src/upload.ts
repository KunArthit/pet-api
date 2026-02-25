import { Elysia, t } from "elysia";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import { promises as fs } from "fs";

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

        // const uploadsDir = path.join(process.cwd(), "uploads");
        // if (!existsSync(uploadsDir)) mkdirSync(uploadsDir);

        const uploadsDir = path.join(process.cwd(), "uploads");
          if (!(await fs.stat(uploadsDir).catch(() => false))) {
            await fs.mkdir(uploadsDir);
            await fs.chmod(uploadsDir, 0o777);
          }

        const fileName = `${Date.now()}-${file.name}`;
        const filePath = path.join(uploadsDir, fileName);
        const buffer = Buffer.from(await file.arrayBuffer());
        writeFileSync(filePath, buffer);

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