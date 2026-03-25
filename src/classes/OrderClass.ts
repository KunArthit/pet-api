// src/classes/OrderClass.ts
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import db from "../core/database";

export default class OrderClass {
  // ฟังก์ชันช่วยสร้างเลขที่เอกสาร (เช่น ORD-20240304-A1B2)
  private generateDocNumber(prefix: string): string {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${date}-${random}`;
  }

  // ฟังก์ชันช่วยจัด Format ที่อยู่ให้ออกมาเป็น Text ยาวๆ เพื่อบันทึกลงบิล
  private formatAddress(addr: RowDataPacket): string {
    const parts = [
      addr.address_line1,
      addr.address_line2,
      addr.sub_district,
      addr.district,
      addr.province,
      addr.zip_code,
    ];
    // กรองเอาเฉพาะค่าที่มี (ไม่เป็น null/undefined/ว่าง) แล้วเอามาต่อกันด้วยช่องว่าง
    return parts.filter(Boolean).join(" ").trim();
  }

  // ==========================================
  // 🛒 สร้าง Order + Quotation (Transaction)
  // ==========================================
  async createOrder(
    userId: string,
    shippingAddressId: number,
    billingAddressId: number,
    shippingCost: number = 0,
    paymentMethod: string = "bank_transfer"
  ): Promise<{ orderId: number; orderNumber: string; quotationNumber: string; totalAmount: number }> {
    const conn = await db.getConnection();
    
    // 🛑 เริ่ม Transaction: ทำงานทุกอย่างให้เสร็จ ถ้ามี Error กลางทางให้ Rollback กลับหมด
    await conn.beginTransaction();

    try {
      // ---------------------------------------------------------
      // 1. ดึงข้อมูลสินค้าจากตะกร้า (Cart)
      // ---------------------------------------------------------
      const [cartItems] = await conn.query<RowDataPacket[]>(
        `SELECT cw.product_id, cw.quantity, p.name, p.sku, p.image_url, p.price 
         FROM cart_wishlist cw 
         JOIN products p ON cw.product_id = p.id
         WHERE cw.user_id = ? AND cw.type = 'cart'`,
        [userId]
      );

      if (cartItems.length === 0) {
        throw new Error("Cart is empty");
      }

      // ---------------------------------------------------------
      // 2. ดึงข้อมูลที่อยู่ (Shipping & Billing)
      // ---------------------------------------------------------
      const [addresses] = await conn.query<RowDataPacket[]>(
        `SELECT * FROM addresses WHERE id IN (?, ?) AND user_id = ?`,
        [shippingAddressId, billingAddressId, userId]
      );

      const shipAddr = addresses.find((a) => a.id === shippingAddressId);
      const billAddr = addresses.find((a) => a.id === billingAddressId);

      if (!shipAddr || !billAddr) {
        throw new Error("Shipping or Billing address not found");
      }

      const fullShippingAddress = this.formatAddress(shipAddr);
      const fullBillingAddress = this.formatAddress(billAddr);

      // คำนวณยอดรวมสุทธิ (Total Amount)
      const subtotal = cartItems.reduce(
        (sum, item) => sum + Number(item.price) * Number(item.quantity),
        0
      );
      const totalAmount = subtotal + shippingCost;

      // ---------------------------------------------------------
      // 📦 3. สร้าง ORDER
      // ---------------------------------------------------------
      const orderNumber = this.generateDocNumber("ORD");
      
      const [orderResult] = await conn.query<ResultSetHeader>(
        `INSERT INTO orders (
          order_number, user_id, total_amount, shipping_cost, status, payment_method, 
          shipping_name, shipping_address, shipping_phone, 
          billing_name, billing_address, billing_phone, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          orderNumber,
          userId,
          totalAmount,
          shippingCost,
          paymentMethod,
          shipAddr.recipient_name,
          fullShippingAddress,
          shipAddr.phone,
          billAddr.recipient_name,
          fullBillingAddress,
          billAddr.phone,
        ]
      );
      const newOrderId = orderResult.insertId;

      // บันทึก Order Items
      for (const item of cartItems) {
        await conn.query(
          `INSERT INTO order_items (
            order_id, product_id, product_name, product_sku, product_image, quantity, price
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            newOrderId, item.product_id, item.name, item.sku,
            item.image_url, item.quantity, item.price,
          ]
        );

        // ✅ สิ่งที่ต้องเพิ่ม: ตัดสต็อกสินค้า
        // ใช้ SET stock_quantity = GREATEST(stock_quantity - ?, 0) เพื่อป้องกันสต็อกติดลบ
        await conn.query(
          `UPDATE products SET stock_quantity = GREATEST(stock_quantity - ?, 0), updated_at = NOW() WHERE id = ?`,
          [item.quantity, item.product_id]
        );
      }

      // ---------------------------------------------------------
      // 📄 4. สร้าง QUOTATION
      // ---------------------------------------------------------
      const quotationNumber = this.generateDocNumber("QT");
      
      // ตั้งวันหมดอายุใบเสนอราคา (เช่น 30 วันนับจากวันนี้)
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + 30);

      const [quotationResult] = await conn.query<ResultSetHeader>(
        `INSERT INTO quotations (
          quotation_number, user_id, total_amount, status, valid_until, 
          company_name, tax_id, address, created_at, updated_at
        ) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, NOW(), NOW())`,
        [
          quotationNumber,
          userId,
          totalAmount,
          validUntil,
          billAddr.recipient_name, // ใช้ชื่อผู้รับบิลเป็น company_name ไปก่อน (หรือ null ถ้าไม่มี)
          null,                    // tax_id (ถ้ามีใน User ค่อยดึงมาใส่)
          fullBillingAddress,
        ]
      );
      const newQuotationId = quotationResult.insertId;

      // บันทึก Quotation Items
      for (const item of cartItems) {
        await conn.query(
          `INSERT INTO quotation_items (
            quotation_id, product_id, product_name, quantity, price, created_at
          ) VALUES (?, ?, ?, ?, ?, NOW())`,
          [
            newQuotationId,
            item.product_id,
            item.name,
            item.quantity,
            item.price,
          ]
        );
      }

      // ---------------------------------------------------------
      // 🧹 5. ล้างตะกร้าสินค้า (Clear Cart)
      // ---------------------------------------------------------
      await conn.query(
        `DELETE FROM cart_wishlist WHERE user_id = ? AND type = 'cart'`,
        [userId]
      );

      // ✅ คอนเฟิร์มการทำงานทั้งหมด บันทึกลง Database จริง
      await conn.commit(); 
      
      // ส่งค่ากลับไปให้ Controller นำไปส่งต่อให้ PaymentClass
      return { 
        orderId: newOrderId, 
        orderNumber, 
        quotationNumber, 
        totalAmount 
      };

    } catch (error) {
      // ❌ ถ้ามี Error ตรงไหนก็ตาม ให้ย้อนกลับ (Rollback) ข้อมูลทั้งหมด
      await conn.rollback(); 
      console.error("Transaction Failed (Create Order):", error);
      throw error;
    } finally {
      // คืน Connection กลับสู่ Pool เสมอ
      conn.release();
    }
  }

  // ==========================================
  // 📋 ดึงประวัติคำสั่งซื้อทั้งหมดของ User
  // ==========================================
  async getUserOrders(): Promise<RowDataPacket[]> {
    const conn = await db.getConnection();
    try {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT * FROM orders ORDER BY created_at DESC`,
      );
      return rows;
    } catch (error) {
      console.error("Failed to fetch user orders:", error);
      return [];
    } finally {
      conn.release();
    }
  }

  // ==========================================
  // 📋 ดึงประวัติคำสั่งซื้อทั้งหมดของ User
  // ==========================================
  async getUserOrdersByUserId(userId: string): Promise<RowDataPacket[]> {
    const conn = await db.getConnection();
    try {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC`,
        [userId]
      );
      return rows;
    } catch (error) {
      console.error("Failed to fetch user orders:", error);
      return [];
    } finally {
      conn.release();
    }
  }

  // ==========================================
  // 🔍 ดึงรายละเอียดคำสั่งซื้อ (พร้อมสินค้าในบิล)
  // ==========================================
  async getOrderDetails(orderNumber: string, userId: string): Promise<any | null> {
    const conn = await db.getConnection();
    try {
      // 1. ดึงข้อมูล Order หลัก
      const [orders] = await conn.query<RowDataPacket[]>(
        `SELECT o.*, p.slip_image 
          FROM orders o 
          LEFT JOIN payments p ON o.id = p.order_id 
          WHERE o.order_number = ? AND o.user_id = ? LIMIT 1`,
        [orderNumber, userId]
      );

      if (orders.length === 0) return null;
      const order = orders[0];

      // 2. ดึงข้อมูลสินค้าที่อยู่ใน Order นั้น
      const [items] = await conn.query<RowDataPacket[]>(
        `SELECT * FROM order_items WHERE order_id = ?`,
        [order.id]
      );
      
      order.items = items;

      return order;
    } catch (error) {
      console.error("Failed to fetch order details:", error);
      return null;
    } finally {
      conn.release();
    }
  }

  // ==========================================
  // 👑 [Admin] ดึงรายละเอียดคำสั่งซื้อ (ไม่ต้องเช็ค user_id)
  // ==========================================
  async getAdminOrderDetails(orderNumber: string): Promise<any | null> {
    const conn = await db.getConnection();
    try {
      // ดึงข้อมูล Order หลัก และ Payment Slip (ไม่กรอง user_id)
      const [orders] = await conn.query<RowDataPacket[]>(
        `SELECT o.*, p.slip_image 
          FROM orders o 
          LEFT JOIN payments p ON o.id = p.order_id 
          WHERE o.order_number = ? LIMIT 1`,
        [orderNumber]
      );

      if (orders.length === 0) return null;
      const order = orders[0];

      // ดึงข้อมูลสินค้าที่อยู่ใน Order นั้น
      const [items] = await conn.query<RowDataPacket[]>(
        `SELECT * FROM order_items WHERE order_id = ?`,
        [order.id]
      );
      
      order.items = items;

      return order;
    } catch (error) {
      console.error("Failed to fetch admin order details:", error);
      return null;
    } finally {
      conn.release();
    }
  }

 // 👑 [Admin] อัปเดตสถานะคำสั่งซื้อ (รองรับการยกเลิก + คืนสต็อก)
  async updateOrderStatus(orderId: number, status: string, cancelReason: string | null = null): Promise<boolean> {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // 1. อัปเดตสถานะ Order
      const [result] = await conn.query<ResultSetHeader>(
        `UPDATE orders SET status = ?, cancel_reason = ?, updated_at = NOW() WHERE id = ?`,
        [status, status === 'cancelled' ? cancelReason : null, orderId]
      );

      // 2. ✅ ถ้าสถานะเป็น 'cancelled' ต้องคืนสต็อกสินค้า!
      if (status === 'cancelled') {
        // ดึงรายการสินค้าทั้งหมดในบิลนี้ออกมา
        const [items] = await conn.query<RowDataPacket[]>(
          `SELECT product_id, quantity FROM order_items WHERE order_id = ? AND product_id IS NOT NULL`,
          [orderId]
        );

        // วนลูปคืนสต็อกกลับให้ตาราง products
        for (const item of items) {
          await conn.query(
            `UPDATE products SET stock_quantity = stock_quantity + ?, updated_at = NOW() WHERE id = ?`,
            [item.quantity, item.product_id]
          );
        }
      }

      await conn.commit();
      return result.affectedRows > 0;
    } catch (error) {
      await conn.rollback();
      console.error("Failed to update order status:", error);
      return false;
    } finally {
      conn.release();
    }
  }
}