import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DEFAULT_DIST = path.join(REPO_ROOT, "extension", "dist");
const DEFAULT_REPORT = path.join(REPO_ROOT, ".sisyphus", "evidence", "task-27-bundle-report.json");
const DEFAULT_BUDGET_BYTES = 1_200_000;

function parseArgs(argv) {
  const options = {
    reportOnly: false,
    dist: DEFAULT_DIST,
    report: DEFAULT_REPORT,
    budget: Number(process.env.EXTENSION_BUNDLE_BUDGET_BYTES || DEFAULT_BUDGET_BYTES),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--report-only") {
      options.reportOnly = true;
      continue;
    }

    if (arg === "--dist" && argv[i + 1]) {
      options.dist = path.resolve(process.cwd(), argv[i + 1]);
      i += 1;
      continue;
    }

    if (arg === "--report" && argv[i + 1]) {
      options.report = path.resolve(process.cwd(), argv[i + 1]);
      i += 1;
      continue;
    }

    if (arg === "--budget-bytes" && argv[i + 1]) {
      options.budget = Number(argv[i + 1]);
      i += 1;
    }
  }

  return options;
}

async function collectFiles(baseDir) {
  const results = [];
  const entries = await readdir(baseDir, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(baseDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectFiles(absolutePath)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const fileStat = await stat(absolutePath);
    results.push({
      path: absolutePath,
      bytes: fileStat.size,
    });
  }

  return results;
}

function toRelative(base, absolutePath) {
  return path.relative(base, absolutePath).replaceAll("\\", "/");
}

function formatBytes(bytes) {
  return new Intl.NumberFormat("en-US").format(bytes);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const distStats = await stat(options.dist).catch(() => null);
  if (!distStats || !distStats.isDirectory()) {
    console.error(`[perf:check] Dist directory not found: ${options.dist}`);
    process.exit(1);
  }

  const files = await collectFiles(options.dist);
  const filesSorted = files
    .map((file) => ({
      file: toRelative(options.dist, file.path),
      bytes: file.bytes,
    }))
    .sort((a, b) => b.bytes - a.bytes);

  const totalBytes = filesSorted.reduce((acc, file) => acc + file.bytes, 0);
  const report = {
    generatedAt: new Date().toISOString(),
    distDir: toRelative(REPO_ROOT, options.dist),
    budgetBytes: options.budget,
    totalBytes,
    fileCount: filesSorted.length,
    files: filesSorted,
  };

  await mkdir(path.dirname(options.report), { recursive: true });
  await writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`[perf:check] Bundle report: ${options.report}`);
  console.log(
    `[perf:check] Total size: ${formatBytes(totalBytes)} bytes across ${filesSorted.length} files (budget ${formatBytes(options.budget)} bytes)`
  );

  if (options.reportOnly) {
    return;
  }

  if (totalBytes > options.budget) {
    console.error(
      `[perf:check] Budget exceeded by ${formatBytes(totalBytes - options.budget)} bytes`
    );
    process.exit(1);
  }
}

await main();
