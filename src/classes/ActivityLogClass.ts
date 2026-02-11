import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import db from "../core/database";
import type {
  ActivityLogModel,
  CreateActivityLogInput,
} from "../models/ActivityLogModel";

export default class ActivityLogClass {
  /**
   * สร้าง Log ใหม่
   */
  async createLog(payload: CreateActivityLogInput): Promise<boolean> {
    const query = `
      INSERT INTO activity_logs 
        (user_id, action, entity_type, entity_id, details, ip_address, user_agent, created_at)
      VALUES 
        (?, ?, ?, ?, ?, ?, ?, NOW());
    `;

    // ✅ แก้ไขตรงนี้: บังคับแปลงเป็น JSON เสมอ
    let detailsJSON: string;

    if (payload.details) {
      if (typeof payload.details === "string") {
        // กรณีส่งมาเป็น String ธรรมดา -> แปลงให้เป็น Object JSON
        // เช่น "Login Success" -> {"message": "Login Success"}
        detailsJSON = JSON.stringify({ message: payload.details });
      } else {
        // กรณีเป็น Object อยู่แล้ว -> Stringify เลย
        detailsJSON = JSON.stringify(payload.details);
      }
    } else {
      // กรณีไม่มีข้อมูล -> ส่ง JSON ว่าง หรือ null (แล้วแต่ DB ยอมไหม)
      // แนะนำส่ง {} (Empty JSON) เพื่อความปลอดภัย
      detailsJSON = JSON.stringify({}); 
    }

    const values = [
      payload.user_id,
      payload.action,
      payload.entity_type || null,
      payload.entity_id || null,
      detailsJSON, // ✅ ใช้ตัวแปรที่แปลงแล้ว
      payload.ip_address || null,
      payload.user_agent || null,
    ];

    const conn = await db.getConnection();
    try {
      const [result] = await conn.execute<ResultSetHeader>(query, values);
      return result.affectedRows > 0;
    } catch (error) {
      console.error("Failed to create activity log:", error);
      return false;
    } finally {
      conn.release();
    }
  }

  /**
   * ดึง Log ของ User คนนั้นๆ
   */
  async getLogsByUserId(
    userId: string,
    limit: number = 20
  ): Promise<ActivityLogModel[]> {
    const query = `
      SELECT * FROM activity_logs 
      WHERE user_id = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `;

    const conn = await db.getConnection();
    try {
      // Cast limit เป็น string หรือ number ให้ชัดเจนเพื่อกัน error ในบาง version
      const [rows] = await conn.query<RowDataPacket[]>(query, [
        userId,
        limit.toString(),
      ]);
      return rows as ActivityLogModel[];
    } catch (error) {
      console.error("Failed to get user logs:", error);
      return [];
    } finally {
      conn.release();
    }
  }
}