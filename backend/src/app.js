import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import { config } from "./config.js";
import { query } from "./db/query.js";
import authRoutes from "./routes/auth.routes.js";
import jobsRoutes from "./routes/jobs.routes.js";
import contractorRoutes from "./routes/contractor.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";

var app = express();

app.use(
  cors({
    origin: config.corsOrigin === "*" ? true : config.corsOrigin.split(",").map(function (entry) {
      return entry.trim();
    }),
    credentials: true
  })
);
app.use(helmet());
app.use(express.json({ limit: "1mb" }));
app.use(morgan(config.nodeEnv === "production" ? "combined" : "dev"));

app.get("/api/health", async function (req, res, next) {
  try {
    var dbResult = await query("SELECT NOW() AS now");
    res.json({
      status: "ok",
      timestamp: dbResult.rows[0].now
    });
  } catch (error) {
    next(error);
  }
});

app.use("/api/auth", authRoutes);
app.use("/api", jobsRoutes);
app.use("/api/contractor", contractorRoutes);
app.use("/api/admin", adminRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
