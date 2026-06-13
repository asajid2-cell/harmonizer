import "./env.js"; // must be first — populates process.env before config is read
import express from "express";
import cookieParser from "cookie-parser";
import { pathToFileURL } from "node:url";
import { config } from "./config.js";
import { getDb, seed } from "./db.js";
import { attachUser } from "./middleware.js";
import { authRouter } from "./routes/authRoutes.js";
import { adminRouter } from "./routes/adminRoutes.js";
import { internalRouter } from "./routes/internalRoutes.js";

export function createApp() {
  getDb();
  seed();

  const app = express();
  app.set("trust proxy", config.trustProxy);
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use(cookieParser());
  app.use(attachUser);

  app.use("/internal", internalRouter);                 // localhost-only oracle (not nginx-routed)
  app.use(`${config.basePath}/admin`, adminRouter);     // /auth/admin/*
  app.use(config.basePath, authRouter);                 // /auth/*

  // Convenience root redirect when hit directly (the real site owns "/").
  app.get("/", (_req, res) => res.redirect(`${config.basePath}/login`));

  return app;
}

// Start only when run directly (tests import createApp instead).
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const app = createApp();
  app.listen(config.port, config.host, () => {
    console.log(`[hl-auth] listening on http://${config.host}:${config.port}  (base path ${config.basePath})`);
    if (!config.bootstrapAdminPassword) console.warn("[hl-auth] WARNING: BOOTSTRAP_ADMIN_PASSWORD not set.");
  });
}
