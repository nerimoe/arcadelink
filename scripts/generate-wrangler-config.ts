import { mkdir } from "node:fs/promises";
import { dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const outputPath = fileURLToPath(new URL("../wrangler.generated.jsonc", import.meta.url));
const redirectPath = fileURLToPath(new URL("../.wrangler/deploy/config.json", import.meta.url));
const localOnly = process.argv.includes("--local");

const workerName = readOptional("ARCADELINK_WORKER_NAME") ?? "arcadelink-api";
const accountId = readOptional("ARCADELINK_ACCOUNT_ID") ?? "23bd231499318d1677ffbb1b9dd704ae";
const routePattern = readOptional("ARCADELINK_ROUTE_PATTERN") ?? "link.neri.moe";
const appOrigin = readOptional("ARCADELINK_APP_ORIGIN") ?? "https://link.neri.moe";
const munetClientId = readOptional("ARCADELINK_MUNET_CLIENT_ID") ?? "5cac2374-2d27-4e26-a710-fe1fe9e94b4a";
const extraAllowedOrigins = readOptional("ARCADELINK_EXTRA_ALLOWED_ORIGINS") ?? "http://localhost:5173";

const databaseName = readOptional("ARCADELINK_D1_DATABASE_NAME") ?? "arcadelink";
const databaseId =
  readOptional("ARCADELINK_D1_DATABASE_ID") ??
  (localOnly ? "00000000-0000-0000-0000-000000000000" : "8f2b923d-6732-48e1-8e29-830d3b86449a");
const previewDatabaseId = readOptional("ARCADELINK_D1_PREVIEW_DATABASE_ID");
const kvRateLimitId = readOptional("ARCADELINK_KV_RATE_LIMIT_ID") ?? "1df12f4558674675928e056f3a03e9b5";

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
  account_id: accountId,
  main: "worker/index.ts",
  compatibility_date: "2026-05-04",
  compatibility_flags: ["nodejs_compat"],
  observability: {
    enabled: true,
    head_sampling_rate: 1,
  },
  routes: routePattern
    ? [
        {
          pattern: routePattern,
          custom_domain: true,
        },
      ]
    : [],
  assets: {
    directory: "dist",
    not_found_handling: "single-page-application",
    run_worker_first: ["/api/*", "/callback", "/t/*"],
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
