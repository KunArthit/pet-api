import { emailTransporter } from "../core/email";
import { env } from "../core/config";
import crypto from "crypto";
import type { RowDataPacket } from "mysql2/promise";
import db from "../core/database";

interface EmailVerificationRow extends RowDataPacket {
  user_id: string;
  token: string;
  expires_at: Date;
  verified: number;
  verified_at: Date | null;
}

class EmailVerificationClass {
  // 🔍 หา token ที่ยังใช้ได้ (ยังไม่หมดอายุ + ยังไม่ถูกใช้)
  async findValidToken(userId: string): Promise<EmailVerificationRow[]> {
    const [rows] = await db.query<EmailVerificationRow[]>(
      `SELECT * FROM email_verifications
       WHERE user_id = ?
         AND expires_at > NOW()
         AND verified = 0
       ORDER BY expires_at DESC
       LIMIT 1`,
      [userId]
    );

    return rows;
  }

  // ✅ สร้าง token เก็บลง DB
  async create(userId: string): Promise<string> {
    const token = crypto.randomUUID();

    // ✅ หมดอายุใน 15 นาที (ใช้เวลาไทยตรงกับ MySQL)
    const expires_at = new Date(Date.now() + 15 * 60 * 1000);

    await db.query(
      `INSERT INTO email_verifications (user_id, token, expires_at) VALUES (?, ?, ?)`,
      [userId, token, expires_at]
    );

    return token;
  }

  // ✅ ตรวจสอบ token และ activate user (ไม่ลบออก แต่ mark ว่า verified แล้ว)
  async verify(token: string): Promise<boolean> {
    const [rows] = await db.query<EmailVerificationRow[]>(
      `SELECT * FROM email_verifications WHERE token = ?`,
      [token]
    );
  
    if (!rows?.length) return false;
  
    const record = rows[0];
  
    // ถ้าหมดอายุ
    if (new Date(record.expires_at) < new Date()) return false;
  
    // ✅ ถ้าเคย verify แล้ว — ถือว่าสำเร็จ
    if (record.verified === 1) return true;
  
    // ยังไม่ verify → ทำการยืนยัน
    await db.query(
      `UPDATE users 
       SET email_verified = 1, email_verified_at = NOW() 
       WHERE id = ?`,
      [record.user_id]
    );
  
    await db.query(
      `UPDATE email_verifications 
       SET verified = 1, verified_at = NOW()
       WHERE token = ?`,
      [token]
    );
  
    return true;
  }

  // ✅ ส่งอีเมลยืนยัน (แบบลิงก์ธรรมดา)
  async sendVerifyEmail(to: string, token: string) {
    if (!env.SMTP_USER || !env.SMTP_PASS) {
      throw new Error("SMTP configuration missing");
    }

    const verifyUrl = `${env.FRONTEND_URL}/verify-email?token=${token}`;
    console.log("📧 Sending verify email →", to);
    console.log("🔗 Verify URL →", verifyUrl);

    await emailTransporter.sendMail({
      from: `"${env.COMPANY_NAME}" <${env.FROM_EMAIL || env.SMTP_USER}>`,
      to,
      subject: "🐾 ยืนยันอีเมลของคุณ | Welcome to " + env.COMPANY_NAME,
      html: `
      <div style="
        font-family: 'Segoe UI', Arial, sans-serif;
        background-color: #f7fafc;
        padding: 40px 0;
        color: #333;
      ">
        <div style="
          max-width: 480px;
          margin: 0 auto;
          background: #ffffff;
          border-radius: 20px;
          box-shadow: 0 4px 10px rgba(0,0,0,0.05);
          padding: 40px 30px;
        ">
          <!-- Logo -->
          <div style="text-align: center; margin-bottom: 30px;">
            <div style="font-size: 28px; font-weight: bold; color: #79A68F;">
              🐾 ${env.COMPANY_NAME}
            </div>
          </div>
    
          <!-- Header -->
          <h2 style="text-align: center; color: #222; margin-bottom: 10px;">
            ยืนยันอีเมลของคุณ
          </h2>
          <p style="text-align: center; color: #555; font-size: 15px; margin-bottom: 30px;">
            ขอบคุณที่สมัครสมาชิกกับ <strong>${env.COMPANY_NAME}</strong><br/>
            กรุณายืนยันอีเมลของคุณเพื่อเริ่มต้นการใช้งาน
          </p>
    
          <!-- Button -->
          <div style="text-align: center; margin: 35px 0;">
            <a href="${verifyUrl}"
              target="_blank"
              style="
                background-color: #79A68F;
                color: white;
                padding: 14px 30px;
                border-radius: 8px;
                text-decoration: none;
                font-weight: bold;
                display: inline-block;
                letter-spacing: 0.5px;
              "
            >
              ✅ ยืนยันอีเมล
            </a>
          </div>
    
          <!-- Footer -->
          <p style="font-size: 13px; color: #777; text-align: center; line-height: 1.5;">
            ลิงก์นี้จะหมดอายุใน <strong>15 นาที</strong><br/>
            หากปุ่มด้านบนไม่ทำงาน คุณสามารถคัดลอกลิงก์ด้านล่างไปวางในเบราว์เซอร์ได้:
          </p>
    
          <div style="
            word-break: break-all;
            background: #f1f5f9;
            padding: 10px 15px;
            border-radius: 8px;
            font-size: 12px;
            color: #444;
            margin-top: 10px;
          ">
            ${verifyUrl}
          </div>
    
          <div style="text-align: center; margin-top: 40px; color: #aaa; font-size: 12px;">
            © ${new Date().getFullYear()} ${env.COMPANY_NAME}. All rights reserved.
          </div>
        </div>
      </div>
      `,
    });
  }
}

export const EmailVerification = new EmailVerificationClass();