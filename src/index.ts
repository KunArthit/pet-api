// Load environment variables first
import dotenv from "dotenv";
dotenv.config();

import { app } from "./app";
import { env } from "./core/config";

app.listen({
  port: env.PORT,
  hostname: env.HOSTNAME,
});

console.log(`🚀 Server is running on http://${env.HOSTNAME}:${env.PORT}`);
console.log(`📁 Swagger docs at http://${env.HOSTNAME}:${env.PORT}/docs`);
