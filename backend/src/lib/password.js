import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const DEV_SALT = "coalsmart-dev-salt";

export function hashPassword(password, salt = DEV_SALT) {
  return createHash("sha256").update(`${salt}:${password}`).digest("hex");
}

export function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export function newToken() {
  return randomBytes(24).toString("hex");
}

export function sha256Hex(input) {
  return createHash("sha256").update(input).digest("hex");
}
