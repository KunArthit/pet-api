// src/controllers/PaymentController.ts
import { Elysia, t } from "elysia";
import PaymentClass from "../classes/PaymentClass";
import { AuthGuardClass } from "../classes/AuthGuardClass";
import ActivityLogClass from "../classes/ActivityLogClass";
import { jwtPlugin } from "../utils/jwt-plugin";
import { join } from "path";

const PaymentService = new PaymentClass();
const AuthGuard = new AuthGuardClass();
const LogService = new ActivityLogClass();

const PaymentController = new Elysia({ prefix: "/payments", tags: ["Payments"] })

  // ============================================================
  // 🟢 1. Webhook จากธนาคาร (Endpoint ปล่อยโล่ง ไม่ต้องมี JWT)
  // ============================================================
  .post("/webhook", async ({ body, request, set }) => {
    try {
      // 💡 อนาคต: ตรงนี้ต้องตรวจสอบ Webhook Signature จากธนาคารเพื่อกันคนอื่นยิงมั่ว
      
      const payload = body as any; // ข้อมูลที่ธนาคารส่งกลับมา

      if (payload.status === "successful") {
        // เรียกฟังก์ชันยืนยันการจ่ายเงิน
        await PaymentService.confirmPaymentSuccess(payload.payment_id, payload.order_id);
        
        // 📝 บันทึก Log การจ่ายเงินสำเร็จ
        await LogService.createLog({
          user_id: payload.user_id || "SYSTEM", 
          action: "PAYMENT_SUCCESS",
          entity_type: "ORDER",
          entity_id: String(payload.order_id),
          details: { message: "Payment processed via Webhook", payload },
          ip_address: request.headers.get("x-forwarded-for") || "webhook",
          user_agent: request.headers.get("user-agent") || "webhook",
        });

      } else if (payload.status === "failed") {
        // 📝 บันทึก Log การจ่ายเงินล้มเหลว
        await LogService.createLog({
          user_id: payload.user_id || "SYSTEM", 
          action: "PAYMENT_FAILED",
          entity_type: "ORDER",
          entity_id: String(payload.order_id),
          details: { message: "Payment failed via Webhook", payload },
          ip_address: request.headers.get("x-forwarded-for") || "webhook",
          user_agent: request.headers.get("user-agent") || "webhook",
        });
      }

      return { success: true, message: "Webhook received and processed" };
    } catch (error) {
      console.error("Webhook Error:", error);
      set.status = 500;
      return { success: false, message: "Webhook processing failed" };
    }
  })

  // ============================================================
  // 🔒 โซนด้านล่างนี้ บังคับใช้ JWT (User ใช้งาน)
  // ============================================================
  .use(jwtPlugin)

  // 🔵 2. ขอ Link ชำระเงินซ้ำ (กรณี User ปิดหน้าจ่ายเงินทิ้งไป แล้วกลับมากดจ่ายใหม่ในหน้า "ประวัติคำสั่งซื้อ")
  // 🔵 1. ขอข้อมูลชำระเงิน (รองรับ QR)
  .post("/pay", async ({ body, request, jwt, set }) => {
    const user = await AuthGuard.validate(request, jwt);
    if (!user) { set.status = 401; return { success: false, message: "Unauthorized" }; }

    try {
      const result = await PaymentService.createPaymentSession(body.order_id, user.id, body.amount, body.payment_method);

      return { success: true, message: "Payment session retrieved", data: result };
    } catch (error) {
      console.error("Payment Init Error:", error);
      set.status = 500;
      return { success: false, message: "Failed to initialize payment" };
    }
  }, {
    body: t.Object({
      order_id: t.Number(),
      amount: t.Number(),
      payment_method: t.String({ default: "promptpay" })
    })
  })

  // 🟡 2. อัปโหลดสลิป (Upload Slip) 🚀
  .post("/:id/upload-slip", async ({ params, body, request, jwt, set }) => {
    const user = await AuthGuard.validate(request, jwt);
    if (!user) { set.status = 401; return { success: false, message: "Unauthorized" }; }

    try {
      const paymentId = Number(params.id);
      const file = body.slip_image;

      // ตรวจสอบว่าแนบไฟล์มาจริงไหม
      if (!file || file.size === 0) {
        set.status = 400;
        return { success: false, message: "Please upload a valid image file." };
      }

      // 1. ตั้งชื่อไฟล์ใหม่ให้ไม่ซ้ำ (เช่น slip_1_1690000000.png)
      const ext = file.name.split('.').pop();
      const fileName = `slip_${paymentId}_${Date.now()}.${ext}`;
      
      // 2. กำหนดที่เก็บไฟล์ (อย่าลืมไปสร้างโฟลเดอร์ public/uploads/slips ไว้ด้วยนะครับ!)
      const uploadPath = join(process.cwd(), "public", "uploads", "slips", fileName);
      
      // 3. ใช้ Bun.write เซฟไฟล์ลงดิสก์
      await Bun.write(uploadPath, file);
      
      // 4. URL ที่จะเก็บลง Database (เพื่อให้ Frontend เอาไปดึงรูปแสดงได้)
      const slipUrl = `/uploads/slips/${fileName}`;
      
      // วันที่เวลาที่โอน (ถ้าผู้ใช้ไม่ได้ระบุมา ให้ใช้เวลาปัจจุบัน)
      const transferDate = body.transfer_at ? new Date(body.transfer_at) : new Date();

      // 5. บันทึกลง Database
      await PaymentService.uploadSlip(paymentId, user.id, slipUrl, transferDate);

      // 📝 เก็บ Log
      await LogService.createLog({
        user_id: user.id,
        action: "UPLOAD_SLIP",
        entity_type: "PAYMENT",
        entity_id: String(paymentId),
        details: `User uploaded payment slip for payment ID: ${paymentId}`,
      });

      return { 
        success: true, 
        message: "Slip uploaded successfully! Pending admin verification.",
        slip_url: slipUrl
      };

    } catch (error: any) {
      console.error("Upload Slip Error:", error);
      set.status = error.message.includes("not found") ? 404 : 500;
      return { success: false, message: error.message || "Failed to upload slip" };
    }
  }, {
    body: t.Object({
      slip_image: t.File(), // 📌 รับค่าเป็น File
      transfer_at: t.Optional(t.String()) // รับเวลาที่โอนมาด้วย (ถ้ามี)
    })
  });

export default PaymentController;