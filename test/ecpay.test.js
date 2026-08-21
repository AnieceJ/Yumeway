import test from "node:test";
import assert from "node:assert/strict";

import {
  createEcpayCheckMacValue,
  getEcpayConfig,
  verifyEcpayCheckMacValue,
} from "../utils/ecpay.js";

const TEST_HASH_KEY = "TestHashKey1234567";
const TEST_HASH_IV = "TestHashIv123456";

const officialSample = {
  TradeDesc: "促銷方案",
  PaymentType: "aio",
  MerchantTradeDate: "2023/03/12 15:30:23",
  MerchantTradeNo: "ecpay20230312153023",
  MerchantID: "3002607",
  ReturnURL: "https://www.ecpay.com.tw/receive.php",
  ItemName: "Apple iphone 15",
  TotalAmount: 30000,
  ChoosePayment: "ALL",
  EncryptType: 1,
};

test("creates a stable CheckMacValue for an AioCheckOut request", () => {
  const actual = createEcpayCheckMacValue(
    officialSample,
    TEST_HASH_KEY,
    TEST_HASH_IV,
  );

  assert.equal(
    actual,
    "11BBE82477624A1783B38B1A46C3349A0AB5837409FF557314338B89063B2A77",
  );
});

test("verifies callbacks without including CheckMacValue in the checksum", () => {
  const CheckMacValue = createEcpayCheckMacValue(
    officialSample,
    TEST_HASH_KEY,
    TEST_HASH_IV,
  );

  assert.equal(
    verifyEcpayCheckMacValue(
      { ...officialSample, CheckMacValue },
      TEST_HASH_KEY,
      TEST_HASH_IV,
    ),
    true,
  );
  assert.equal(
    verifyEcpayCheckMacValue(
      { ...officialSample, CheckMacValue: "0".repeat(64) },
      TEST_HASH_KEY,
      TEST_HASH_IV,
    ),
    false,
  );
});

test("rejects partially configured ECPay credentials", () => {
  assert.throws(
    () => getEcpayConfig({ ECPAY_MERCHANT_ID: "3002607" }),
    /設定不完整/,
  );
});

test("reads complete ECPay credentials from the environment", () => {
  assert.deepEqual(
    getEcpayConfig({
      ECPAY_MERCHANT_ID: "test-merchant",
      ECPAY_HASH_KEY: "test-key",
      ECPAY_HASH_IV: "test-iv",
    }),
    {
      merchantId: "test-merchant",
      hashKey: "test-key",
      hashIv: "test-iv",
      paymentUrl: "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5",
    },
  );
});
