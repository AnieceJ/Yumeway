import crypto from "crypto";

export const ECPAY_STAGE_CONFIG = Object.freeze({
  merchantId: "3002607",
  hashKey: "pwFHCqoQZGmho4w6",
  hashIv: "EkRm7iFT261dpevs",
  paymentUrl: "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5",
});

function encodeForEcpay(value) {
  return encodeURIComponent(value)
    .replace(/%20/g, "+")
    .replace(/'/g, "%27")
    .replace(/~/g, "%7E")
    .toLowerCase();
}

export function createEcpayCheckMacValue(params, hashKey, hashIv) {
  const query = Object.entries(params)
    .filter(([key, value]) => key !== "CheckMacValue" && value !== undefined && value !== null)
    .sort(([a], [b]) => {
      const left = a.toLowerCase();
      const right = b.toLowerCase();
      return left < right ? -1 : left > right ? 1 : 0;
    })
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("&");

  const encoded = encodeForEcpay(`HashKey=${hashKey}&${query}&HashIV=${hashIv}`);
  return crypto.createHash("sha256").update(encoded).digest("hex").toUpperCase();
}

export function verifyEcpayCheckMacValue(params, hashKey, hashIv) {
  const received = String(params.CheckMacValue || "").toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(received)) return false;

  const expected = createEcpayCheckMacValue(params, hashKey, hashIv);
  return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

export function getEcpayConfig(env = process.env) {
  const supplied = [env.ECPAY_MERCHANT_ID, env.ECPAY_HASH_KEY, env.ECPAY_HASH_IV];
  const suppliedCount = supplied.filter(Boolean).length;

  if (suppliedCount > 0 && suppliedCount < supplied.length) {
    throw new Error("ECPay 設定不完整，MerchantID、HashKey、HashIV 必須一起設定");
  }

  return {
    merchantId: env.ECPAY_MERCHANT_ID || ECPAY_STAGE_CONFIG.merchantId,
    hashKey: env.ECPAY_HASH_KEY || ECPAY_STAGE_CONFIG.hashKey,
    hashIv: env.ECPAY_HASH_IV || ECPAY_STAGE_CONFIG.hashIv,
    paymentUrl: env.ECPAY_PAYMENT_URL || ECPAY_STAGE_CONFIG.paymentUrl,
  };
}
