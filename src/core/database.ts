// import mysql from "mysql2/promise";
// import dotenv from "dotenv";

// dotenv.config();

// const db = mysql.createPool({
//   host: process.env.MYSQL_HOST,
//   port: process.env.MYSQL_PORT ? Number(process.env.MYSQL_PORT) : undefined,
//   user: process.env.MYSQL_USER,
//   password: process.env.MYSQL_PASSWORD,
//   database: process.env.MYSQL_DB,
//   charset: "utf8mb4",
//   waitForConnections: true,
//   connectionLimit: 10,
//   queueLimit: 0,
//   timezone: "+07:00", // ✅ ใช้เวลาประเทศไทยตรงกับ dayjs ฝั่ง Node
// });

// export default db;


import mysql from "mysql2/promise";
import dotenv from "dotenv";

// ใช้ createPool แทน createConnection
const db = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DB,
  port: Number(process.env.MYSQL_PORT),
  
  // ✅ Setting สำคัญที่ต้องเพิ่มเพื่อแก้ Connection Lost:
  waitForConnections: true,
  connectionLimit: 10,    // รองรับ 10 connection พร้อมกัน
  queueLimit: 0,
  enableKeepAlive: true,  // ✨ พระเอกของเรา: ช่วยยิง ping เลี้ยง connection ไว้ไม่ให้ตัด
  keepAliveInitialDelay: 0,
});

// Test Connection (Optional: เช็คตอนรัน Server)
db.getConnection()
  .then((conn) => {
    console.log("✅ Database Connected via Pool!");
    conn.release(); // อย่าลืม release คืน pool
  })
  .catch((err) => {
    console.error("❌ Database Connection Failed:", err);
  });

export default db;