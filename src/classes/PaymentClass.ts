// src/classes/PaymentClass.ts
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import db from "../core/database";

export default class PaymentClass {
  
  // ==========================================
  // 1. สร้าง Payment Session (รองรับ PromptPay QR)
  // ==========================================
  async createPaymentSession(orderId: number, userId: string, amount: number, paymentMethod: string) {
    const conn = await db.getConnection();
    try {
      const [existing] = await conn.query<RowDataPacket[]>(
        `SELECT id FROM payments WHERE order_id = ? AND status = 'pending' LIMIT 1`,
        [orderId]
      );

      let paymentId: number;

      if (existing.length > 0) {
        paymentId = existing[0].id;
        await conn.query(
          `UPDATE payments SET amount = ?, updated_at = NOW() WHERE id = ?`, 
          [amount, paymentId]
        );
      } else {
        const [result] = await conn.query<ResultSetHeader>(
          `INSERT INTO payments (order_id, user_id, amount, status, created_at, updated_at) 
           VALUES (?, ?, ?, 'pending', NOW(), NOW())`,
          [orderId, userId, amount]
        );
        paymentId = result.insertId;
      }
      
      // 💡 สร้างข้อมูลอ้างอิงสำหรับ PromptPay (ใช้เบอร์โทรร้านค้าของคุณ)
      const storePromptPayNumber = "0812345678"; // เปลี่ยนเป็นเบอร์ร้านจริง
      
      return { 
        payment_id: paymentId,
        payment_method: paymentMethod,
        amount: amount,
        promptpay_number: paymentMethod === "promptpay" ? storePromptPayNumber : null,
        // (Optional) ถ้าคุณลง package `promptpay-qr` สามารถเจน Payload เป็น String ส่งไปให้ Frontend วาด QR ได้เลย
      };
    } finally {
      conn.release();
    }
  }

  // ==========================================
  // 2. อัปโหลดสลิป (Manual Transfer)
  // ==========================================
 async uploadSlip(paymentId: number, userId: string, slipImageUrl: string, transferAt: Date) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction(); // 👈 เริ่มต้น Transaction
      
      // 1. อัปเดตรูปสลิปลงตาราง payments
      const [result] = await conn.query<ResultSetHeader>(
        `UPDATE payments SET slip_image = ?, transfer_at = ?, updated_at = NOW() 
         WHERE id = ? AND user_id = ? AND status = 'pending'`,
        [slipImageUrl, transferAt, paymentId, userId]
      );
      if (result.affectedRows === 0) throw new Error("Payment not found");

      // 2. 👈 ค้นหาว่าการจ่ายเงินนี้ผูกกับ order_id อะไร
      const [paymentInfo] = await conn.query<RowDataPacket[]>(`SELECT order_id FROM payments WHERE id = ?`, [paymentId]);

      if (paymentInfo.length > 0) {
        // 3. 👈 สั่งอัปเดตสถานะออเดอร์ให้เปลี่ยนเป็น 'processing' (กำลังตรวจสอบยอดเงิน) ทันที!
        await conn.query(
           `UPDATE orders SET status = 'processing', updated_at = NOW() WHERE id = ?`,
           [paymentInfo[0].order_id]
        );
      }

      await conn.commit(); // 👈 คอนเฟิร์ม
      return true;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  // ==========================================
  // 2. การยืนยันชำระเงินสำเร็จ (รันผ่าน Webhook)
  // ==========================================
  async confirmPaymentSuccess(paymentId: number, orderId: number) {
    const conn = await db.getConnection();
    
    // 🛑 ใช้ Transaction เพราะเราต้องอัปเดตหลายตารางพร้อมกัน
    await conn.beginTransaction(); 

    try {
      // 1. อัปเดตตาราง Payments ว่า "โอนแล้ว" (completed) พร้อมแสตมป์เวลา transfer_at
      await conn.query(
        `UPDATE payments SET status = 'completed', transfer_at = NOW(), updated_at = NOW() WHERE id = ?`,
        [paymentId]
      );

      // 2. อัปเดตตาราง Orders ให้สถานะเป็น 'paid'
      await conn.query(
        `UPDATE orders SET status = 'paid', updated_at = NOW() WHERE id = ?`,
        [orderId]
      );

      // 3. อัปเดตตาราง Quotations ให้สถานะเป็น 'approved' 
      // (หา Quotation จาก user_id และยอดรวมที่ตรงกับ order นี้)
      const [orders] = await conn.query<RowDataPacket[]>(
        `SELECT user_id, total_amount FROM orders WHERE id = ?`, 
        [orderId]
      );

      if (orders.length > 0) {
        await conn.query(
          `UPDATE quotations SET status = 'approved', updated_at = NOW() 
           WHERE user_id = ? AND total_amount = ? AND status = 'pending' 
           ORDER BY id DESC LIMIT 1`,
          [orders[0].user_id, orders[0].total_amount]
        );
      }

      await conn.commit();
      return true;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }
}