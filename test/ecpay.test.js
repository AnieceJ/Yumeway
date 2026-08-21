import test from "node:test";
import assert from "node:assert/strict";

import {
  ECPAY_STAGE_CONFIG,
  createEcpayCheckMacValue,
  getEcpayConfig,
  verifyEcpayCheckMacValue,
} from "../utils/ecpay.js";

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

test("creates the CheckMacValue from ECPay's official AioCheckOut sample", () => {
  const actual = createEcpayCheckMacValue(
    officialSample,
    ECPAY_STAGE_CONFIG.hashKey,
    ECPAY_STAGE_CONFIG.hashIv,
  );

  assert.equal(
    actual,
    "6C51C9E6888DE861FD62FB1DD17029FC742634498FD813DC43D4243B5685B840",
  );
});

test("verifies callbacks without including CheckMacValue in the checksum", () => {
  const CheckMacValue = createEcpayCheckMacValue(
    officialSample,
    ECPAY_STAGE_CONFIG.hashKey,
    ECPAY_STAGE_CONFIG.hashIv,
  );

  assert.equal(
    verifyEcpayCheckMacValue(
      { ...officialSample, CheckMacValue },
      ECPAY_STAGE_CONFIG.hashKey,
      ECPAY_STAGE_CONFIG.hashIv,
    ),
    true,
  );
  assert.equal(
    verifyEcpayCheckMacValue(
      { ...officialSample, CheckMacValue: "0".repeat(64) },
      ECPAY_STAGE_CONFIG.hashKey,
      ECPAY_STAGE_CONFIG.hashIv,
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
