// src/classes/SettingsClass.ts

import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import db from "../core/database";
import {
  SettingsModel,
  PaymentMethodModel,
  UpdateSettingsInput,
  CreatePaymentMethodInput
} from "../models/SettingsModel";

export default class SettingsClass {

  // ==========================================
  // ⚙️ ดึง Settings + Payment Methods
  // ==========================================
  async getSettings(): Promise<{
    settings: SettingsModel | null;
    payments: PaymentMethodModel[];
  }> {

    const conn = await db.getConnection();

    try {

      const [settingsRows] = await conn.query<RowDataPacket[]>(
        `SELECT * FROM settings LIMIT 1`
      );

      const [paymentRows] = await conn.query<RowDataPacket[]>(
        `SELECT * FROM payment_methods ORDER BY id DESC`
      );

      const settings = settingsRows.length
        ? (settingsRows[0] as SettingsModel)
        : null;

      const payments = paymentRows as PaymentMethodModel[];

      return {
        settings,
        payments
      };

    } catch (error) {

      console.error("Failed to fetch settings:", error);
      return {
        settings: null,
        payments: []
      };

    } finally {
      conn.release();
    }
  }

  // ==========================================
  // ✏️ Update Store Settings
  // ==========================================
  async updateSettings(data: UpdateSettingsInput): Promise<boolean> {

    const conn = await db.getConnection();

    try {

      const {
        store_name,
        email,
        phone,
        address,
        logo
      } = data;

      await conn.query<ResultSetHeader>(
        `UPDATE settings
         SET store_name = ?,
             email = ?,
             phone = ?,
             address = ?,
             logo = ?
         WHERE id = 1`,
        [
          store_name,
          email,
          phone,
          address,
          logo ?? null
        ]
      );

      return true;

    } catch (error) {

      console.error("Failed to update settings:", error);
      return false;

    } finally {
      conn.release();
    }
  }

  // ==========================================
  // 🏦 เพิ่มบัญชีธนาคาร
  // ==========================================
  async addPaymentMethod(
    data: CreatePaymentMethodInput
  ): Promise<number | null> {

    const conn = await db.getConnection();

    try {

      const {
        bank_name,
        account_name,
        account_number
      } = data;

      const [result] = await conn.query<ResultSetHeader>(
        `INSERT INTO payment_methods
        (bank_name, account_name, account_number)
        VALUES (?, ?, ?)`,
        [
          bank_name,
          account_name,
          account_number
        ]
      );

      return result.insertId;

    } catch (error) {

      console.error("Failed to add payment method:", error);
      return null;

    } finally {
      conn.release();
    }
  }

  // ==========================================
  // 🗑 ลบบัญชีธนาคาร
  // ==========================================
  async deletePaymentMethod(id: number): Promise<boolean> {

    const conn = await db.getConnection();

    try {

      await conn.query<ResultSetHeader>(
        `DELETE FROM payment_methods WHERE id = ?`,
        [id]
      );

      return true;

    } catch (error) {

      console.error("Failed to delete payment method:", error);
      return false;

    } finally {
      conn.release();
    }
  }

}