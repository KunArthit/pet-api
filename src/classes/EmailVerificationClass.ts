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
      subject: "Verify your email address",
      html: `
        <div style="background-color:#f4f6f8;padding:40px 0;font-family:Arial,Helvetica,sans-serif;">
          <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 4px 10px rgba(0,0,0,0.08);">
            <div style="background-color:#0066cc;color:#fff;padding:20px 30px;text-align:center;">
              <h1 style="margin:0;font-size:22px;">Welcome to ${env.COMPANY_NAME}</h1>
            </div>
            <div style="padding:30px;color:#333;">
              <p style="font-size:16px;">Hello,</p>
              <p style="font-size:15px;">Thank you for registering with <strong>${env.COMPANY_NAME}</strong>.</p>
              <p style="font-size:15px;">Please confirm your email address by clicking the button below:</p>
              <div style="text-align:center;margin:30px 0;">
                <a href="${verifyUrl}" target="_blank"
                  style="background-color:#0066cc;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:bold;display:inline-block;">
                  Verify Email
                </a>
              </div>
              <p style="font-size:14px;color:#555;">If the button above doesn't work, copy and paste the link below into your browser:</p>
              <p style="word-break:break-all;font-size:13px;color:#0066cc;">${verifyUrl}</p>
              <p style="font-size:12px;color:#999;margin-top:30px;">
                This link will expire in 15 minutes. If you did not sign up, please ignore this email.
              </p>
            </div>
            <div style="background-color:#f0f0f0;text-align:center;padding:15px;font-size:12px;color:#888;">
              © ${new Date().getFullYear()} ${env.COMPANY_NAME}. All rights reserved.
            </div>
          </div>
        </div>
      `,
    });
  }
}

export const EmailVerification = new EmailVerificationClass();