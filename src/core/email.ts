import nodemailer from "nodemailer";
import { env } from "./config";

export const emailTransporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465, // Gmail = false (587)
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS
  }
});