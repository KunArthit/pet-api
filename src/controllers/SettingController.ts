// src/controllers/SettingsController.ts

import { Elysia, t } from "elysia";
import SettingsClass from "../classes/SettingsClass";
import { AuthGuardClass } from "../classes/AuthGuardClass";
import ActivityLogClass from "../classes/ActivityLogClass";
import { jwtPlugin } from "../utils/jwt-plugin";

const SettingsService = new SettingsClass();
const AuthGuard = new AuthGuardClass();
const LogService = new ActivityLogClass();

const settingsController = new Elysia({ prefix: "/settings", tags: ["Settings"] })
  .use(jwtPlugin)

  // ============================================================
  // ⚙️ ดึง Settings ของระบบ
  // ============================================================
  .get("/", async ({ request, jwt, set }) => {

    const user = await AuthGuard.validate(request, jwt);
    if (!user) {
      set.status = 401;
      return { success: false, message: "Unauthorized" };
    }

    const result = await SettingsService.getSettings();

    return {
      success: true,
      data: result
    };
  })

  // ============================================================
  // ✏️ Update Store Settings
  // ============================================================
  .put("/", async ({ body, request, jwt, set }) => {

    const user = await AuthGuard.validate(request, jwt);
    if (!user) {
      set.status = 401;
      return { success: false, message: "Unauthorized" };
    }

    const updated = await SettingsService.updateSettings(body);

    if (!updated) {
      set.status = 500;
      return { success: false, message: "Failed to update settings" };
    }

    // 📝 Activity Log
    await LogService.createLog({
      user_id: user.id,
      action: "UPDATE_SETTINGS",
      entity_type: "SETTINGS",
      entity_id: "system",
      details: {
        message: "Updated store settings",
        payload: body
      },
      ip_address: request.headers.get("x-forwarded-for") || "unknown",
      user_agent: request.headers.get("user-agent") || "unknown",
    });

    return {
      success: true,
      message: "Settings updated successfully"
    };

  }, {
    body: t.Object({
      store_name: t.String(),
      email: t.String(),
      phone: t.String(),
      address: t.String(),
      logo: t.Optional(t.String())
    })
  })

  // ============================================================
  // 🏦 เพิ่มบัญชีธนาคาร
  // ============================================================
  .post("/payment", async ({ body, request, jwt, set }) => {

    const user = await AuthGuard.validate(request, jwt);
    if (!user) {
      set.status = 401;
      return { success: false, message: "Unauthorized" };
    }

    const paymentId = await SettingsService.addPaymentMethod(body);

    if (!paymentId) {
      set.status = 500;
      return { success: false, message: "Failed to add payment method" };
    }

    await LogService.createLog({
      user_id: user.id,
      action: "CREATE_PAYMENT_METHOD",
      entity_type: "PAYMENT_METHOD",
      entity_id: String(paymentId),
      details: {
        message: "Added new payment method",
        payload: body
      },
      ip_address: request.headers.get("x-forwarded-for") || "unknown",
      user_agent: request.headers.get("user-agent") || "unknown",
    });

    return {
      success: true,
      message: "Payment method added successfully",
      data: {
        id: paymentId,
        bank_name: body.bank_name,
        account_name: body.account_name,
        account_number: body.account_number,
        is_active: 1
      }
    };

  }, {
    body: t.Object({
      bank_name: t.String(),
      account_name: t.String(),
      account_number: t.String()
    })
  })

  // ============================================================
// 🔄 เปิด / ปิด การใช้งานบัญชี
// ============================================================
.put("/payment/:id", async ({ params, body, request, jwt, set }) => {

  const user = await AuthGuard.validate(request, jwt);
  if (!user) {
    set.status = 401;
    return { success: false, message: "Unauthorized" };
  }

  const updated = await SettingsService.updatePaymentMethod(
    Number(params.id),
    body
  );

  if (!updated) {
    set.status = 500;
    return { success: false, message: "Failed to update payment method" };
  }

  await LogService.createLog({
    user_id: user.id,
    action: "UPDATE_PAYMENT_METHOD",
    entity_type: "PAYMENT_METHOD",
    entity_id: params.id,
    details: {
      message: "Updated payment method",
      payload: body
    },
    ip_address: request.headers.get("x-forwarded-for") || "unknown",
    user_agent: request.headers.get("user-agent") || "unknown",
  });

  return {
    success: true,
    message: "Payment method updated successfully"
  };

}, {
  body: t.Object({
    is_active: t.Number()
  })
})

  // ============================================================
  // 🗑 ลบบัญชีธนาคาร
  // ============================================================
  .delete("/payment/:id", async ({ params, request, jwt, set }) => {

    const user = await AuthGuard.validate(request, jwt);
    if (!user) {
      set.status = 401;
      return { success: false, message: "Unauthorized" };
    }

    const deleted = await SettingsService.deletePaymentMethod(
      Number(params.id)
    );

    if (!deleted) {
      set.status = 500;
      return { success: false, message: "Failed to delete payment method" };
    }

    await LogService.createLog({
      user_id: user.id,
      action: "DELETE_PAYMENT_METHOD",
      entity_type: "PAYMENT_METHOD",
      entity_id: params.id,
      details: {
        message: "Deleted payment method"
      },
      ip_address: request.headers.get("x-forwarded-for") || "unknown",
      user_agent: request.headers.get("user-agent") || "unknown",
    });

    return {
      success: true,
      message: "Payment method deleted successfully"
    };

  });

export default settingsController;