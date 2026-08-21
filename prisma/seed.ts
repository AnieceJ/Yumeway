import { prisma } from "../lib/prisma.js";
import bcrypt from "bcrypt";
import fs from "fs";
import path from "path";

const DEMO_ACCOUNT = "demo@example.com";
const DEMO_PASSWORD = "qwe123";

async function ensureDemoAccount() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  await prisma.$executeRawUnsafe(
    `INSERT INTO users
      (account, password, role, status, created_at, updated_at, google_id)
     VALUES (?, ?, 11, 1, NOW(), NOW(), NULL)
     ON DUPLICATE KEY UPDATE
       password = VALUES(password),
       role = 11,
       status = 1,
       updated_at = NOW()`,
    DEMO_ACCOUNT,
    passwordHash,
  );

  const demoUsers = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
    "SELECT id FROM users WHERE account = ? LIMIT 1",
    DEMO_ACCOUNT,
  );
  const demoUserId = Number(demoUsers[0]?.id);
  if (!Number.isInteger(demoUserId) || demoUserId < 1) {
    throw new Error("Demo account was not created");
  }

  await prisma.$executeRawUnsafe(
    `INSERT INTO user_profile
      (profile_id, first_name, last_name, nick_name, city, district, address, phone, birthday, avatar, updated_at)
     VALUES (?, 'Demo', 'User', '作品展示帳號', '臺北市', '中正區', '作品展示地址', '0900000000', '2000-01-01', '/user/default_avatars/chicken_normal.png', NOW())
     ON DUPLICATE KEY UPDATE
       first_name = VALUES(first_name),
       last_name = VALUES(last_name),
       nick_name = VALUES(nick_name),
       city = VALUES(city),
       district = VALUES(district),
       address = VALUES(address),
       phone = VALUES(phone),
       birthday = VALUES(birthday),
       avatar = VALUES(avatar),
       updated_at = NOW()`,
    demoUserId,
  );

  console.log(`✅ Demo account ready: ${DEMO_ACCOUNT}`);
}

async function main() {
  // 1. 在這裡「按順序」列出所有要執行的 SQL 檔名
  const sqlFiles = [
    '01-users.sql',
    '02-article.sql',
    '03-shop.sql',
    '04-accounting.sql'
  ];

  const existingUsers = await prisma.$queryRawUnsafe<Array<{ total: number | bigint }>>(
    "SELECT COUNT(*) AS total FROM users",
  );
  const hasSeedData = Number(existingUsers[0]?.total || 0) > 0;

  if (hasSeedData) {
    console.log("ℹ️ 資料庫已有展示資料，略過完整資料植入。");
  } else {
    console.log(`🌱 開始植入 ${sqlFiles.length} 個 SQL 檔案...`);

    // 2. 外層迴圈：逐一處理每個檔案
    for (const fileName of sqlFiles) {
      const sqlPath = path.join(process.cwd(), "prisma", fileName);

      // 防呆：確認檔案存在
      if (!fs.existsSync(sqlPath)) {
        console.warn(`⚠️ 找不到檔案：${fileName}，跳過執行。`);
        continue;
      }

      const sqlContent = fs.readFileSync(sqlPath, "utf8");

      // 切割單條指令
      const statements = sqlContent
        .split("--cut")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      console.log(`📄 正在執行 ${fileName}（包含 ${statements.length} 條指令）...`);

      // 內層迴圈：執行該檔案中的 SQL
      for (const statement of statements) {
        await prisma.$executeRawUnsafe(statement);
      }
    }
  }

  await ensureDemoAccount();
  console.log('✅ 所有 SQL 資料植入完成！');
}

main()
  .catch((e) => {
    console.error('❌ 執行失敗：', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
