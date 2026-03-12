// src/controllers/OrderController.ts
import { Elysia, t } from "elysia";
import OrderClass from "../classes/OrderClass";
import PaymentClass from "../classes/PaymentClass";
import { AuthGuardClass } from "../classes/AuthGuardClass";
import ActivityLogClass from "../classes/ActivityLogClass";
import { jwtPlugin } from "../utils/jwt-plugin";
import { sendLineNotification } from "../services/lineService";

const OrderService = new OrderClass();
const PaymentService = new PaymentClass();
const AuthGuard = new AuthGuardClass();
const LogService = new ActivityLogClass();

const orderController = new Elysia({ prefix: "/orders", tags: ["Orders"] })
  .use(jwtPlugin)

  // ============================================================
  // 🟢 ดึงประวัติคำสั่งซื้อทั้งหมดของฉัน
  // ============================================================
  .get("/", async ({ request, jwt, set }) => {
    const user = await AuthGuard.validate(request, jwt);
    if (!user) { 
      set.status = 401; 
      return { success: false, message: "Unauthorized" }; 
    }

    const orders = await OrderService.getUserOrders(user.id);
    return { success: true, data: orders };
  })

  // ============================================================
  // 🟢 ดึงรายละเอียดคำสั่งซื้อ
  // ============================================================
  .get("/:orderNumber", async ({ params, request, jwt, set }) => {
    const user = await AuthGuard.validate(request, jwt);
    if (!user) { 
      set.status = 401; 
      return { success: false, message: "Unauthorized" }; 
    }

    const order = await OrderService.getOrderDetails(params.orderNumber, user.id);
    
    if (!order) {
      set.status = 404;
      return { success: false, message: "Order not found" };
    }

    return { success: true, data: order };
  })

  // ============================================================
  // 🔵 สร้างคำสั่งซื้อใหม่ (Checkout)
  // ============================================================
  .post("/", async ({ body, request, jwt, set }) => {
    const user = await AuthGuard.validate(request, jwt);
    if (!user) { 
      set.status = 401; 
      return { success: false, message: "Unauthorized" }; 
    }

    try {

      // 1️⃣ สร้าง Order
      const orderResult = await OrderService.createOrder(
        user.id,
        body.shipping_address_id,
        body.billing_address_id,
        body.shipping_cost,
        body.payment_method
      );

      // 2️⃣ สร้าง Payment Session
      const paymentResult = await PaymentService.createPaymentSession(
        orderResult.orderId,
        user.id,
        orderResult.totalAmount,
        body.payment_method
      );

      // =====================================================
      // 🔔 LINE Notification
      // =====================================================

      const paymentMap: Record<string, string> = {
        promptpay: "PromptPay",
        bank_transfer: "Bank Transfer",
        cod: "Cash on Delivery"
      };
      
      const paymentLabel = paymentMap[body.payment_method] || body.payment_method;
      
      const adminUrl = `https://admin.yoursite.com/orders/${orderResult.orderNumber}`;
      
      const message = `
📦 ORDER ใหม่เข้าระบบ

🧾 Order : ${orderResult.orderNumber}
👤 Customer : ${user.username || user.email || "Customer"}
💰 Total : ${orderResult.totalAmount} บาท
💳 Payment : ${paymentLabel}
      
🔎 ดูรายละเอียด : ${adminUrl}
      `;
      
      try {
        await sendLineNotification(message);
      } catch (err) {
        console.error("LINE notify failed", err);
      }

      // =====================================================
      // 📝 Activity Log
      // =====================================================

      await LogService.createLog({
        user_id: user.id,
        action: "CREATE_ORDER",
        entity_type: "ORDER",
        entity_id: orderResult.orderNumber,
        details: { 
          message: "Created order and initiated payment", 
          order: orderResult,
          payment_id: paymentResult.payment_id
        },
        ip_address: request.headers.get("x-forwarded-for") || "unknown",
        user_agent: request.headers.get("user-agent") || "unknown",
      });

      // =====================================================
      // 📦 Response
      // =====================================================

      return { 
        success: true, 
        message: "Order placed and payment initiated successfully", 
        data: {
          order_id: orderResult.orderId,
          order_number: orderResult.orderNumber,
          quotation_number: orderResult.quotationNumber,
          payment_id: paymentResult.payment_id,
          payment_method: paymentResult.payment_method,
          amount: paymentResult.amount
        } 
      };

    } catch (error: any) {
      console.error("Checkout Error:", error);
      set.status = error.message === "Cart is empty" ? 400 : 500;

      return { 
        success: false, 
        message: error.message || "Failed to create order" 
      };
    }
  }, {
    body: t.Object({
      shipping_address_id: t.Number(),
      billing_address_id: t.Number(),
      shipping_cost: t.Number({ default: 0 }),
      payment_method: t.String({ default: "bank_transfer" })
    })
  });

export default orderController;