import { mkdir } from "node:fs/promises";
import { dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const outputPath = fileURLToPath(new URL("../wrangler.generated.jsonc", import.meta.url));
const redirectPath = fileURLToPath(new URL("../.wrangler/deploy/config.json", import.meta.url));
const localOnly = Bun.argv.includes("--local");

const workerName = readConfigValue("ARCADELINK_WORKER_NAME", "arcadelink-api");
const accountId = readOptional("ARCADELINK_ACCOUNT_ID");
const routePattern = readOptional("ARCADELINK_ROUTE_PATTERN");
const appOrigin = readConfigValue("ARCADELINK_APP_ORIGIN", "http://localhost:5173");
const munetClientId = readConfigValue("ARCADELINK_MUNET_CLIENT_ID", "local-munet-client");
const extraAllowedOrigins = readConfigValue("ARCADELINK_EXTRA_ALLOWED_ORIGINS", "http://localhost:5173");
const appleTeamId = readConfigValue("ARCADELINK_APPLE_TEAM_ID", "XKKMJBTHX5");
const androidCertFingerprints = readOptional("ARCADELINK_ANDROID_CERT_FINGERPRINTS") ?? "";

const databaseName = readConfigValue("ARCADELINK_D1_DATABASE_NAME", "arcadelink");
const databaseId =
  readOptional("ARCADELINK_D1_DATABASE_ID") ??
  (localOnly ? "00000000-0000-0000-0000-000000000000" : undefined);
const previewDatabaseId = readOptional("ARCADELINK_D1_PREVIEW_DATABASE_ID");
const kvRateLimitId = readConfigValue(
  "ARCADELINK_KV_RATE_LIMIT_ID",
  "00000000000000000000000000000000",
);

if (!localOnly) {
  requireValue("ARCADELINK_ACCOUNT_ID", accountId);
  requireValue("ARCADELINK_ROUTE_PATTERN", routePattern);
}

if (!databaseId) {
  throw new Error(
    "ARCADELINK_D1_DATABASE_ID is required. Set it in .env locally or in Cloudflare Workers Builds variables.",
  );
}

validateWorkerName(workerName);
validateDatabaseId("ARCADELINK_D1_DATABASE_ID", databaseId);
if (previewDatabaseId) validateDatabaseId("ARCADELINK_D1_PREVIEW_DATABASE_ID", previewDatabaseId);

const databaseBinding: Record<string, string> = {
  binding: "DB",
  database_name: databaseName,
  database_id: databaseId,
  migrations_dir: "migrations",
};
if (previewDatabaseId) databaseBinding.preview_database_id = previewDatabaseId;

const config = {
  $schema: "node_modules/wrangler/config-schema.json",
  name: workerName,
  ...(accountId ? { account_id: accountId } : {}),
  main: "worker/index.ts",
  compatibility_date: "2026-05-04",
  compatibility_flags: ["nodejs_compat", "global_fetch_strictly_public"],
  observability: {
    enabled: true,
    head_sampling_rate: 1,
  },
  routes: routePattern
    ? [
        {
          pattern: routePattern.replace(/\/\*$/, ""),
          custom_domain: true,
        },
      ]
    : [],
  assets: {
    directory: "dist",
    not_found_handling: "single-page-application",
    run_worker_first: ["/api/*", "/callback", "/t/*", "/.well-known/*"],
  },
  d1_databases: [databaseBinding],
  kv_namespaces: [
    {
      binding: "RATE_LIMIT",
      id: kvRateLimitId,
    },
  ],
  vars: {
    APP_ORIGIN: appOrigin,
    MUNET_CLIENT_ID: munetClientId,
    EXTRA_ALLOWED_ORIGINS: extraAllowedOrigins,
    APPLE_TEAM_ID: appleTeamId,
    ANDROID_CERT_FINGERPRINTS: androidCertFingerprints,
  },
};

const jsonContent = `${JSON.stringify(config, null, 2)}\n`;
if (typeof Bun !== "undefined") {
  await Bun.write(outputPath, jsonContent);
  await mkdir(dirname(redirectPath), { recursive: true });
  await Bun.write(redirectPath, '{"configPath":"../../wrangler.generated.jsonc"}\n');
} else {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(outputPath, jsonContent);
  await mkdir(dirname(redirectPath), { recursive: true });
  await writeFile(redirectPath, '{"configPath":"../../wrangler.generated.jsonc"}\n');
}

console.log(`Generated ${relative(projectRoot, outputPath)} for Worker ${workerName}.`);

function readOptional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function readConfigValue(name: string, localDefault: string): string {
  return readOptional(name) ?? (localOnly ? localDefault : readRequired(name));
}

function readRequired(name: string): string {
  const value = readOptional(name);
  if (!value) {
    throw new Error(`${name} is required. Set it in .env locally or in Cloudflare Workers Builds variables.`);
  }
  return value;
}

function requireValue(name: string, value: string | undefined): asserts value is string {
  if (!value) {
    throw new Error(`${name} is required. Set it in .env locally or in Cloudflare Workers Builds variables.`);
  }
}

function validateWorkerName(value: string): void {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,253}[a-z0-9])?$/.test(value)) {
    throw new Error("ARCADELINK_WORKER_NAME must contain only lowercase letters, digits, and interior dashes.");
  }
}

function validateDatabaseId(name: string, value: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${name} must be a D1 database UUID.`);
  }
}
