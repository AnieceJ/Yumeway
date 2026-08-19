import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret";

export function getUserId(req) {
  const auth = req.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  if (!token) {
    return 1;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return Number(payload.id);
  } catch {
    return 1;
  }
}