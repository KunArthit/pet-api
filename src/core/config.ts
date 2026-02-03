import z from "zod";

// Ensure dotenv is loaded for environment variables
import dotenv from "dotenv";
dotenv.config();

const envSchema = z
  .object({
    // Application
    NODE_ENV: z
      .enum(["development", "test", "production"], {
        message: 'NODE_ENV must be one of "development", "test", "production"',
      })
      .default("development")
      .describe("Node environment"),
    HOSTNAME: z
      .string()
      .default("localhost") // TODO: wait for support hostname https://github.com/colinhacks/zod/pull/3692
      .describe("API hostname"),
    PORT: z
      .number({
        coerce: true,
        message: "PORT must be a number",
      })
      .int()
      .positive({ message: "PORT must be a positive number" })
      .min(1000, { message: "PORT should be >= 1000 and < 65536" })
      .max(65535, { message: "PORT should be >= 1000 and < 65536" })
      .default(8080)
      .describe("API port"),

    // Security
    CORS_ORIGINS: z
      .string()
      .optional()
      .transform((value) => (value ? value.split(",") : undefined))
      .pipe(
        z
          .union([z.string().trim().url(), z.literal("*")])
          .array()
          .optional()
      )
      .describe("Comma-separated list of origins for the CORS policy"),
    SECRET_KEY: z
      .string()
      .default(new Bun.CryptoHasher("sha256").digest("hex"))
      .describe("Secret key for hashing"),
    ACCESS_TOKEN_EXPIRE: z
      .string()
      .default("10y")
      .refine((value) => /^\d+[smhdwMy]$/.test(value))
      .describe("Access token expiration time"),

    // Database
    MYSQL_HOST: z.string().min(1).default("localhost").describe("MySQL host"),
    MYSQL_PORT: z
      .number({ coerce: true })
      .int()
      .positive()
      .default(3306)
      .describe("MySQL port"),
    MYSQL_DB: z //
      .string()
      .min(1)
      .max(128)
      .describe("MySQL database name"),
    MYSQL_USER: z //
      .string()
      .min(1)
      .max(16)
      .describe("MySQL user"),
    MYSQL_PASSWORD: z //
      .string()
      .min(1)
      .max(128)
      .describe("MySQL password"),

    // Email/SMTP Configuration
    SMTP_HOST: z
      .string()
      .optional()
      .default("smtp.gmail.com")
      .describe("SMTP server host"),
    SMTP_PORT: z
      .number({ coerce: true })
      .int()
      .positive()
      .optional()
      .default(587)
      .describe("SMTP server port"),
    SMTP_USER: z
      .string()
      .optional()
      .describe("SMTP username/email"),
    SMTP_PASS: z
      .string()
      .optional()
      .describe("SMTP password/app password"),
    FROM_EMAIL: z
      .string()
      .email()
      .optional()
      .default("noreply@petterrain.com")
      .describe("From email address"),
    COMPANY_NAME: z
      .string()
      .optional()
      .default("PETTERRAIN")
      .describe("Company name for emails"),

    // Optional Email Service
    EMAIL_SERVICE_URL: z
      .string()
      .url()
      .optional()
      .describe("External email service URL (SendGrid, etc.)"),
    EMAIL_SERVICE_API_KEY: z
      .string()
      .optional()
      .describe("API key for external email service"),
  })
  .readonly();

// Use both Bun.env and process.env for maximum compatibility
const envData = { ...process.env, ...Bun.env };
const envServer = envSchema.safeParse(envData);

if (!envServer.success) {
  console.error("Invalid environment variables, check the errors below!");
  console.error(envServer.error.issues);
  process.exit(1);
}

export type Environment = z.infer<typeof envSchema>;

export const env: Environment = envServer.data;

export const DATABASE_URI = `mysql://${env.MYSQL_USER}:${env.MYSQL_PASSWORD}@${env.MYSQL_HOST}:${env.MYSQL_PORT}/${env.MYSQL_DB}`;
