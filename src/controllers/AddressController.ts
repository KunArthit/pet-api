import { Elysia, t } from "elysia";
import AddressClass from "../classes/AddressClass";
import { AuthGuardClass } from "../classes/AuthGuardClass";
import ActivityLogClass from "../classes/ActivityLogClass";
import { jwtPlugin } from "../utils/jwt-plugin";

const AddressService = new AddressClass();
const AuthGuard = new AuthGuardClass();
const LogService = new ActivityLogClass();

const addressController = new Elysia({
  prefix: "/addresses",
  tags: ["Addresses"],
})
  .use(jwtPlugin)

  // ============================================================
  // 1. 🟢 Get My Addresses (ดึงที่อยู่ทั้งหมดของฉัน)
  // ============================================================
  .get("/", async ({ request, jwt, set }) => {
    const currentUser = await AuthGuard.validate(request, jwt);
    if (!currentUser) {
      set.status = 401;
      return { success: false, message: "Unauthorized" };
    }

    try {
      const addresses = await AddressService.getAddressesByUserId(currentUser.id);
      return { success: true, data: addresses };
    } catch (error) {
      set.status = 500;
      return { success: false, message: "Internal Server Error" };
    }
  })

  // ============================================================
  // 2. 🟢 Get Address By ID (ดึงเฉพาะอันเดียว)
  // ============================================================
  .get("/:id", async ({ params, request, jwt, set }) => {
    const currentUser = await AuthGuard.validate(request, jwt);
    if (!currentUser) {
      set.status = 401;
      return { success: false, message: "Unauthorized" };
    }

    try {
      const address = await AddressService.getAddressById(Number(params.id));
      
      if (!address) {
        set.status = 404;
        return { success: false, message: "Address not found" };
      }

      // 🔒 Authorization Check: ห้ามดูที่อยู่คนอื่น
      if (address.user_id !== currentUser.id && currentUser.role !== "admin") {
        set.status = 403;
        return { success: false, message: "Forbidden" };
      }

      return { success: true, data: address };
    } catch (error) {
      set.status = 500;
      return { success: false, message: "Internal Server Error" };
    }
  })

  // ============================================================
  // 3. 🔵 Create Address (สร้างที่อยู่ + Log)
  // ============================================================
  .post("/", async ({ body, request, jwt, set }) => {
    const currentUser = await AuthGuard.validate(request, jwt);
    if (!currentUser) {
      set.status = 401;
      return { success: false, message: "Unauthorized" };
    }

    try {
      // Prepare Payload
      const newAddressId = await AddressService.createAddress({
        user_id: currentUser.id, // บังคับใช้ ID จาก Token
        ...body,
        is_default: body.is_default ?? 0,
        type: (body.type ?? "shipping") as "shipping" | "billing",
      });

      // ✅ Activity Log
      await LogService.createLog({
        user_id: currentUser.id,
        action: "CREATE_ADDRESS",
        entity_type: "ADDRESS",
        entity_id: String(newAddressId),
        details: { message: "User added a new address", province: body.province },
        ip_address: request.headers.get("x-forwarded-for") || "unknown",
        user_agent: request.headers.get("user-agent") || "unknown",
      });

      return { success: true, message: "Address created", id: newAddressId };
    } catch (error) {
      console.error(error);
      set.status = 500;
      return { success: false, message: "Failed to create address" };
    }
  }, {
    body: t.Object({
      recipient_name: t.String(),
      phone: t.String(),
      address_line1: t.String(),
      address_line2: t.Optional(t.String()),
      sub_district: t.String(),
      district: t.String(),
      province: t.String(),
      zip_code: t.String(),
      is_default: t.Optional(t.Number()), // 0 or 1
      type: t.Optional(t.String()), // "shipping" | "billing"
    })
  })

  // ============================================================
  // 4. 🟡 Update Address (แก้ไข + Log)
  // ============================================================
  .put("/:id", async ({ params, body, request, jwt, set }) => {
    const currentUser = await AuthGuard.validate(request, jwt);
    if (!currentUser) {
      set.status = 401;
      return { success: false, message: "Unauthorized" };
    }

    const addressId = Number(params.id);

    try {
      // 1. เช็คความเป็นเจ้าของก่อน
      const existingAddress = await AddressService.getAddressById(addressId);
      if (!existingAddress) {
        set.status = 404;
        return { success: false, message: "Address not found" };
      }

      if (existingAddress.user_id !== currentUser.id && currentUser.role !== "admin") {
        set.status = 403;
        return { success: false, message: "Forbidden: You don't own this address" };
      }

      // 2. ทำการ Update
      const updatePayload = {
        ...body,
        type: body.type ? (body.type as "shipping" | "billing") : undefined,
      };
      const ok = await AddressService.updateAddress(addressId, currentUser.id, updatePayload);
      if (!ok) throw new Error("Update failed");

      // ✅ Activity Log
      await LogService.createLog({
        user_id: currentUser.id,
        action: "UPDATE_ADDRESS",
        entity_type: "ADDRESS",
        entity_id: String(addressId),
        details: { message: "Updated address details", fields: Object.keys(body) },
        ip_address: request.headers.get("x-forwarded-for") || "unknown",
        user_agent: request.headers.get("user-agent") || "unknown",
      });

      return { success: true, message: "Address updated successfully" };
    } catch (error) {
      console.error(error);
      set.status = 500;
      return { success: false, message: "Failed to update address" };
    }
  }, {
    body: t.Partial(t.Object({
      recipient_name: t.String(),
      phone: t.String(),
      address_line1: t.String(),
      address_line2: t.String(),
      sub_district: t.String(),
      district: t.String(),
      province: t.String(),
      zip_code: t.String(),
      is_default: t.Number(),
      type: t.String(),
    }))
  })

  // ============================================================
  // 5. 🔴 Delete Address (ลบ + Log)
  // ============================================================
  .delete("/:id", async ({ params, request, jwt, set }) => {
    const currentUser = await AuthGuard.validate(request, jwt);
    if (!currentUser) {
      set.status = 401;
      return { success: false, message: "Unauthorized" };
    }

    const addressId = Number(params.id);

    try {
      // 1. เช็คความเป็นเจ้าของ
      const existingAddress = await AddressService.getAddressById(addressId);
      if (!existingAddress) {
        set.status = 404;
        return { success: false, message: "Address not found" };
      }

      if (existingAddress.user_id !== currentUser.id && currentUser.role !== "admin") {
        set.status = 403;
        return { success: false, message: "Forbidden" };
      }

      // 2. ลบ
      const ok = await AddressService.deleteAddress(addressId);
      if (!ok) throw new Error("Delete failed");

      // ✅ Activity Log
      await LogService.createLog({
        user_id: currentUser.id,
        action: "DELETE_ADDRESS",
        entity_type: "ADDRESS",
        entity_id: String(addressId),
        details: "User deleted an address",
        ip_address: request.headers.get("x-forwarded-for") || "unknown",
        user_agent: request.headers.get("user-agent") || "unknown",
      });

      return { success: true, message: "Address deleted successfully" };
    } catch (error) {
      console.error(error);
      set.status = 500;
      return { success: false, message: "Failed to delete address" };
    }
  })

  // ============================================================
  // 6. ⭐ Set Default Address (ตั้งเป็นค่าเริ่มต้น)
  // ============================================================
  .patch("/:id/default", async ({ params, request, jwt, set }) => {
    const currentUser = await AuthGuard.validate(request, jwt);
    if (!currentUser) {
      set.status = 401;
      return { success: false, message: "Unauthorized" };
    }

    const addressId = Number(params.id);

    try {
      // 1. เช็คความเป็นเจ้าของ
      const existingAddress = await AddressService.getAddressById(addressId);
      if (!existingAddress || existingAddress.user_id !== currentUser.id) {
        set.status = 403;
        return { success: false, message: "Forbidden or Not Found" };
      }

      // 2. ตั้งค่า Default
      await AddressService.setDefaultAddress(addressId, currentUser.id);

      // ✅ Activity Log
      await LogService.createLog({
        user_id: currentUser.id,
        action: "SET_DEFAULT_ADDRESS",
        entity_type: "ADDRESS",
        entity_id: String(addressId),
        details: "Set address as default",
        ip_address: request.headers.get("x-forwarded-for") || "unknown",
        user_agent: request.headers.get("user-agent") || "unknown",
      });

      return { success: true, message: "Set as default address successfully" };
    } catch (error) {
      console.error(error);
      set.status = 500;
      return { success: false, message: "Failed to set default address" };
    }
  });

export default addressController;