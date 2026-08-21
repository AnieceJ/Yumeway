const DEFAULT_DEMO_ACCOUNT = "demo@example.com";
const DEFAULT_RETENTION_MINUTES = 120;
const DEFAULT_INTERVAL_MINUTES = 15;

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getDemoResetConfig(env = process.env) {
  const enabled = ["1", "true", "yes"].includes(
    String(env.DEMO_RESET_ENABLED || "").toLowerCase(),
  );

  return {
    enabled,
    account: env.DEMO_ACCOUNT || DEFAULT_DEMO_ACCOUNT,
    retentionMinutes: parsePositiveInteger(
      env.DEMO_DATA_RETENTION_MINUTES,
      DEFAULT_RETENTION_MINUTES,
    ),
    intervalMinutes: parsePositiveInteger(
      env.DEMO_RESET_INTERVAL_MINUTES,
      DEFAULT_INTERVAL_MINUTES,
    ),
  };
}

function emptyResult() {
  return {
    ordersDeleted: 0,
    ticketsDeleted: 0,
    pointLogsDeleted: 0,
    cartItemsDeleted: 0,
    favoritesDeleted: 0,
    stockRestoredUnits: 0,
  };
}

export async function resetDemoShopData({
  pool,
  account = DEFAULT_DEMO_ACCOUNT,
  retentionMinutes = DEFAULT_RETENTION_MINUTES,
  now = new Date(),
}) {
  if (!pool?.getConnection) throw new Error("Demo reset requires a database pool");

  const cutoff = new Date(now.getTime() - retentionMinutes * 60 * 1000);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [[demoUser]] = await connection.query(
      "SELECT id FROM users WHERE account = ? LIMIT 1",
      [account],
    );
    if (!demoUser) {
      await connection.commit();
      return emptyResult();
    }

    const userId = Number(demoUser.id);
    const [orders] = await connection.query(
      `SELECT id, status
       FROM \`orders\`
       WHERE user_id = ? AND created_at < ?
       ORDER BY id
       FOR UPDATE`,
      [userId, cutoff],
    );
    const orderIds = orders.map((order) => Number(order.id));
    const result = emptyResult();

    if (orderIds.length > 0) {
      const [stockRows] = await connection.query(
        `SELECT oi.product_id, SUM(oi.quantity) AS quantity
         FROM order_items oi
         JOIN \`orders\` o ON o.id = oi.order_id
         WHERE o.id IN (?) AND o.user_id = ? AND o.status = 2
         GROUP BY oi.product_id`,
        [orderIds, userId],
      );

      for (const row of stockRows) {
        const quantity = Number(row.quantity) || 0;
        if (quantity < 1) continue;
        await connection.query(
          "UPDATE products SET stock_qty = COALESCE(stock_qty, 0) + ? WHERE id = ?",
          [quantity, Number(row.product_id)],
        );
        result.stockRestoredUnits += quantity;
      }

      const [ticketDelete] = await connection.query(
        "DELETE FROM user_tickets WHERE user_id = ? AND order_id IN (?)",
        [userId, orderIds],
      );
      result.ticketsDeleted = ticketDelete.affectedRows;

      const [pointDelete] = await connection.query(
        "DELETE FROM point_logs WHERE user_id = ? AND order_id IN (?)",
        [userId, orderIds],
      );
      result.pointLogsDeleted = pointDelete.affectedRows;

      const [orderDelete] = await connection.query(
        "DELETE FROM `orders` WHERE user_id = ? AND id IN (?)",
        [userId, orderIds],
      );
      result.ordersDeleted = orderDelete.affectedRows;
    }

    const [cartDelete] = await connection.query(
      "DELETE FROM cart WHERE user_id = ? AND created_at < ?",
      [userId, cutoff],
    );
    result.cartItemsDeleted = cartDelete.affectedRows;

    const [favoriteDelete] = await connection.query(
      "DELETE FROM favorites WHERE user_id = ? AND created_at < ?",
      [userId, cutoff],
    );
    result.favoritesDeleted = favoriteDelete.affectedRows;

    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export function startDemoShopResetScheduler({
  pool,
  env = process.env,
  logger = console,
}) {
  const config = getDemoResetConfig(env);
  if (!config.enabled) {
    logger.log("ℹ️ Demo 商城資料自動重置未啟用");
    return { config, run: async () => emptyResult(), stop: () => {} };
  }

  let running = false;
  const run = async () => {
    if (running) return emptyResult();
    running = true;
    try {
      const result = await resetDemoShopData({
        pool,
        account: config.account,
        retentionMinutes: config.retentionMinutes,
      });
      const changed = Object.values(result).some((value) => value > 0);
      if (changed) logger.log("🧹 Demo 商城資料已自動重置", result);
      return result;
    } catch (error) {
      logger.error("❌ Demo 商城資料重置失敗:", error.message);
      return emptyResult();
    } finally {
      running = false;
    }
  };

  void run();
  const timer = setInterval(run, config.intervalMinutes * 60 * 1000);
  timer.unref?.();

  logger.log(
    `⏱️ Demo 商城資料將保留 ${config.retentionMinutes} 分鐘，每 ${config.intervalMinutes} 分鐘檢查一次`,
  );
  return { config, run, stop: () => clearInterval(timer) };
}
