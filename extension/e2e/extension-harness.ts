import { existsSync } from "node:fs";
import path from "node:path";

const resolveFromExtensionRoot = (...segments: string[]) =>
  path.resolve(import.meta.dirname, "..", ...segments);

const candidateExtensionDirs = () => {
  const envPath = process.env.EXTENSION_UNPACKED_PATH;

  return [envPath, resolveFromExtensionRoot("dist"), resolveFromExtensionRoot("build")].filter(
    (value): value is string => typeof value === "string" && value.length > 0
  );
};

export const resolveUnpackedExtensionPath = (): string => {
  const match = candidateExtensionDirs().find((candidatePath) => existsSync(candidatePath));

  if (!match) {
    throw new Error(
      "Unable to find unpacked extension directory. Build extension first with `pnpm --filter @ragebaiter/extension build`."
    );
  }

  return match;
};

export const getExtensionLaunchArgs = (
  extensionPath = resolveUnpackedExtensionPath()
): string[] => [
  `--disable-extensions-except=${extensionPath}`,
  `--load-extension=${extensionPath}`,
];
