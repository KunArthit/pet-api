import { Elysia, t } from "elysia";
import db from "../core/database";
import type { ResultSetHeader } from "mysql2/promise";

export const consentRoute = new Elysia({ prefix: "/api/consent" })
  .post(
    "/",
    async ({ body, request }) => {
      const ip =
        request.headers.get("cf-connecting-ip") ||
        request.headers.get("x-forwarded-for") ||
        request.headers.get("x-real-ip") ||
        "unknown";

      const userAgent = request.headers.get("user-agent") || "unknown";

      try {
        const [result] = await db.execute<ResultSetHeader>(
          `
          INSERT INTO consents (type, timestamp, ip, user_agent)
          VALUES (?, ?, ?, ?)
          `,
          [
            body.type,
            new Date(body.timestamp), // ✅ สำคัญ (แปลงเป็น Date)
            ip,
            userAgent,
          ]
        );

        console.log("✅ Consent saved to DB:", result.insertId);

        return {
          success: true,
          id: result.insertId,
        };
      } catch (err) {
        console.error("❌ DB Error:", err);
        return { success: false };
      }
    },
    {
      body: t.Object({
        type: t.Union([t.Literal("accept"), t.Literal("reject")]),
        timestamp: t.String(),
      }),
      detail: {
        tags: ["Consent"],
        summary: "Save cookie consent",
      },
    }
  );