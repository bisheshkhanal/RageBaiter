import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

let loaded = false;

export const loadTestEnv = (): void => {
  if (loaded) {
    return;
  }

  const envCandidates = [resolve(process.cwd(), ".env"), resolve(process.cwd(), "..", ".env")];
  const envPath = envCandidates.find((path) => existsSync(path));
  if (!envPath) {
    loaded = true;
    return;
  }

  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    if (key.length === 0 || process.env[key] !== undefined) {
      continue;
    }

    const rawValue = trimmed.slice(separator + 1).trim();
    const value =
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
        ? rawValue.slice(1, -1)
        : rawValue;

    process.env[key] = value;
  }

  loaded = true;
};
