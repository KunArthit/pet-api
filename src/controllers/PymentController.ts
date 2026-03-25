// src/controllers/PaymentController.ts
import { Elysia, t } from "elysia";
import PaymentClass from "../classes/PaymentClass";
import { AuthGuardClass } from "../classes/AuthGuardClass";
import ActivityLogClass from "../classes/ActivityLogClass";
import { jwtPlugin } from "../utils/jwt-plugin";
import { join } from "path";
import { existsSync, mkdirSync } from "fs"; 
import sharp from "sharp"; 
import { sendLineNotification } from "../services/lineService";
import { log } from "console";

const PaymentService = new PaymentClass();
const AuthGuard = new AuthGuardClass();
const LogService = new ActivityLogClass();

// ==========================================
// 📸 Helper Function: จัดการบีบอัดรูปสลิป
// ==========================================
async function uploadAndCompressSlip(file: File, paymentId: number): Promise<string> {
  // ✅ 1. เปลี่ยนให้อยู่ในโฟลเดอร์ uploads ตรงๆ (ไม่มีโฟลเดอร์ slips แล้ว)
  const uploadDir = join(process.cwd(), "public", "uploads");
  
  // ตรวจสอบและสร้างโฟลเดอร์ถ้ายังไม่มี
  if (!existsSync(uploadDir)) {
    mkdirSync(uploadDir, { recursive: true });
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const timestamp = Date.now();
  // ✅ 2. ดึงชื่อไฟล์ดั้งเดิม (ลบนามสกุลเก่าออก) หรือตั้งชื่อ default ถ้าไม่มี
  const originalName = file.name ? file.name.split('.')[0] : `slip${paymentId}`;

  log("Original File Name:", file.name);
  
  // ✅ 3. ตั้งชื่อไฟล์ใหม่ตาม format: 1772694021886-ชื่อไฟล์.webp
  const fileName = `${timestamp}-${originalName}.webp`; 
  const uploadPath = join(uploadDir, fileName);

  // สั่ง sharp บีบอัดสลิป 
  await sharp(buffer)
    .resize({ 
      width: 1000, 
      height: 1000,
      fit: "inside", 
      withoutEnlargement: true 
    })
    .webp({ quality: 80 }) // ยังคงบีบเป็น .webp เพื่อให้ไฟล์เล็กและโหลดเร็วที่สุด
    .toFile(uploadPath);

  // ✅ 4. คืนค่า URL แบบตรงๆ ไม่มี /slips/
  return `/uploads/${fileName}`;
}

const PaymentController = new Elysia({ prefix: "/payments", tags: ["Payments"] })

  // ============================================================
  // 🟢 1. Webhook จากธนาคาร (Endpoint ปล่อยโล่ง ไม่ต้องมี JWT)
  // ============================================================
  .post("/webhook", async ({ body, request, set }) => {
    try {
      const payload = body as any; 

      if (payload.status === "successful") {
        await PaymentService.confirmPaymentSuccess(payload.payment_id, payload.order_id);
        
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

  // 🔵 ขอข้อมูลชำระเงิน (รองรับ QR)
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

      if (!file || file.size === 0) {
        set.status = 400;
        return { success: false, message: "Please upload a valid image file." };
      }

      // ✅ อัปโหลดสลิปและได้ URL รูปแบบ /uploads/177...-filename.webp
      const slipUrl = await uploadAndCompressSlip(file as File, paymentId);
      
      const transferDate = body.transfer_at ? new Date(body.transfer_at) : new Date();

      await PaymentService.uploadSlip(paymentId, user.id, slipUrl, transferDate);

      // ====================================================
      // 🔔 LINE Notification
      // ====================================================
      const slipLink = `https://yoursite.com${slipUrl}`;
      const adminUrl = `https://admin.yoursite.com/payments/${paymentId}`;

      const message = `
💸 ลูกค้าอัปโหลดสลิป

Payment : #${paymentId}
👤 ลูกค้า : ${user.username}
🧾 สลิป : ${slipLink}
🔎 ตรวจสอบ : ${adminUrl}
⏰ เวลาโอน : ${transferDate.toLocaleString("th-TH")}
`;

      try {
        await sendLineNotification(message);
      } catch (err) {
        console.error("LINE notification failed:", err);
      }

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
      set.status = error.message && error.message.includes("not found") ? 404 : 500;
      return { success: false, message: error.message || "Failed to upload slip" };
    }
  }, {
    body: t.Object({
      slip_image: t.File(), 
      transfer_at: t.Optional(t.String()) 
    })
  });

export default PaymentController;