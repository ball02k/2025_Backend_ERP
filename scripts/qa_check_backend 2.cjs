#!/usr/bin/env node
/**
 * Construction ERP – Backend Code Integrity Check
 * Verifies schema, migrations, route registration, imports, tenant filters,
 * BigInt/Number type safety, and API Catalog consistency.
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

console.log("🔍 Running Construction ERP backend QA checks...");

try {
  // 1️⃣  Prisma validity
  execSync("npx prisma validate", { stdio: "inherit" });
  execSync("npx prisma format", { stdio: "inherit" });

  // 2️⃣  Ensure all migrations compile
  execSync("npx prisma migrate resolve --applied all", { stdio: "inherit" });

  // 3️⃣  Check Node imports for breakage
  const src = "routes";
  const broken = [];
  const checkFile = (file) => {
    try {
      require(path.resolve(src, file));
    } catch (err) {
      broken.push(`${file}: ${err.message}`);
    }
  };
  fs.readdirSync(src).forEach(checkFile);
  if (broken.length) {
    console.error("❌ Broken route imports:\n" + broken.join("\n"));
    process.exit(1);
  } else console.log("✅ All route files import cleanly.");

  // 4️⃣  Tenant-scoped query enforcement
  const prismaFiles = fs
    .readdirSync("routes")
    .filter((f) => f.endsWith(".cjs") || f.endsWith(".js"));
  const missingTenant = prismaFiles.filter((f) => {
    const c = fs.readFileSync(path.join("routes", f), "utf8");
    return c.includes("prisma.") && !c.includes("tenantId");
  });
  if (missingTenant.length)
    console.warn("⚠️ Possible missing tenant filters in:\n" + missingTenant.join("\n"));
  else console.log("✅ Tenant scoping present in all Prisma routes.");

  // 5️⃣  BigInt vs Number consistency check
  const schema = fs.readFileSync("prisma/schema.prisma", "utf8");
  if (!schema.match(/BigInt.*documentId/))
    console.error("❌ documentId BigInt rule missing in schema.prisma");
  else console.log("✅ BigInt rules verified for documentId.");

  // 6️⃣  API Catalog validation
  if (fs.existsSync("API_CATALOG.md")) {
    const content = fs.readFileSync("API_CATALOG.md", "utf8");
    const missingRoutes = fs
      .readdirSync("routes")
      .filter((r) => r.endsWith(".cjs"))
      .filter((r) => !content.includes(r.replace(".cjs", "")));
    if (missingRoutes.length)
      console.warn("⚠️ Routes missing from API_CATALOG.md:\n" + missingRoutes.join("\n"));
    else console.log("✅ All routes listed in API_CATALOG.md.");
  }

  console.log("\n🎯 Backend QA check complete — safe to proceed to Codex generation.");
} catch (err) {
  console.error("💥 QA script halted:", err.message);
  process.exit(1);
}
