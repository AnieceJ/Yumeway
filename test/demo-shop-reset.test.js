import test from "node:test";
import assert from "node:assert/strict";

import {
  getDemoResetConfig,
  resetDemoShopData,
} from "../services/demo-shop-reset.js";

function createPool({ failProductUpdate = false } = {}) {
  const calls = [];
  const connection = {
    async beginTransaction() {
      calls.push({ type: "begin" });
    },
    async commit() {
      calls.push({ type: "commit" });
    },
    async rollback() {
      calls.push({ type: "rollback" });
    },
    release() {
      calls.push({ type: "release" });
    },
    async query(sql, params) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      calls.push({ type: "query", sql: normalized, params });

      if (normalized.startsWith("SELECT id FROM users")) return [[{ id: 10 }]];
      if (normalized.startsWith("SELECT id, status FROM `orders`")) {
        return [[{ id: 101, status: 2 }, { id: 102, status: 4 }]];
      }
      if (normalized.startsWith("SELECT oi.product_id")) {
        return [[{ product_id: 5, quantity: "2" }]];
      }
      if (normalized.startsWith("UPDATE products")) {
        if (failProductUpdate) throw new Error("stock update failed");
        return [{ affectedRows: 1 }];
      }
      if (normalized.startsWith("DELETE FROM user_tickets")) return [{ affectedRows: 2 }];
      if (normalized.startsWith("DELETE FROM point_logs")) return [{ affectedRows: 1 }];
      if (normalized.startsWith("DELETE FROM `orders`")) return [{ affectedRows: 2 }];
      if (normalized.startsWith("DELETE FROM cart")) return [{ affectedRows: 3 }];
      if (normalized.startsWith("DELETE FROM favorites")) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected query: ${normalized}`);
    },
  };

  return {
    calls,
    pool: { async getConnection() { return connection; } },
  };
}

test("resets only expired demo shop data and restores paid stock", async () => {
  const { pool, calls } = createPool();
  const now = new Date("2026-08-21T12:00:00.000Z");
  const result = await resetDemoShopData({
    pool,
    retentionMinutes: 120,
    now,
  });

  assert.deepEqual(result, {
    ordersDeleted: 2,
    ticketsDeleted: 2,
    pointLogsDeleted: 1,
    cartItemsDeleted: 3,
    favoritesDeleted: 1,
    stockRestoredUnits: 2,
  });

  const orderSelect = calls.find(
    (call) => call.type === "query" && call.sql.startsWith("SELECT id, status FROM `orders`"),
  );
  assert.equal(orderSelect.params[0], 10);
  assert.equal(orderSelect.params[1].toISOString(), "2026-08-21T10:00:00.000Z");

  const stockUpdate = calls.find(
    (call) => call.type === "query" && call.sql.startsWith("UPDATE products"),
  );
  assert.deepEqual(stockUpdate.params, [2, 5]);
  assert.equal(calls.some((call) => call.type === "commit"), true);
  assert.equal(calls.some((call) => call.type === "release"), true);
});

test("rolls back the whole reset when restoring stock fails", async () => {
  const { pool, calls } = createPool({ failProductUpdate: true });

  await assert.rejects(
    () => resetDemoShopData({ pool, retentionMinutes: 120 }),
    /stock update failed/,
  );
  assert.equal(calls.some((call) => call.type === "rollback"), true);
  assert.equal(calls.some((call) => call.type === "commit"), false);
  assert.equal(calls.some((call) => call.type === "release"), true);
});

test("uses safe defaults and requires an explicit enable flag", () => {
  assert.deepEqual(getDemoResetConfig({}), {
    enabled: false,
    account: "demo@example.com",
    retentionMinutes: 120,
    intervalMinutes: 15,
  });
  assert.deepEqual(
    getDemoResetConfig({
      DEMO_RESET_ENABLED: "true",
      DEMO_DATA_RETENTION_MINUTES: "90",
      DEMO_RESET_INTERVAL_MINUTES: "10",
    }),
    {
      enabled: true,
      account: "demo@example.com",
      retentionMinutes: 90,
      intervalMinutes: 10,
    },
  );
});
