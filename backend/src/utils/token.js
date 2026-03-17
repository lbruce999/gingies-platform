import jwt from "jsonwebtoken";
import { config } from "../config.js";

export function createAccessToken(user) {
  return jwt.sign(
    {
      role: user.role,
      email: user.email,
      username: user.username
    },
    config.jwtSecret,
    {
      subject: String(user.id),
      expiresIn: config.jwtExpiresIn
    }
  );
}
