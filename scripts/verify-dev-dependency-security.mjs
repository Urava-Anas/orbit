import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const lock = JSON.parse(await readFile(path.join(root, "package-lock.json"), "utf8"));
const packageEntries = Object.entries(lock.packages ?? {}).filter(([packagePath]) =>
  packagePath.endsWith("node_modules/brace-expansion"),
);

if (packageEntries.length === 0) {
  throw new Error("No brace-expansion packages were found in package-lock.json.");
}

function versionParts(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`Unexpected brace-expansion version: ${version}`);
  return match.slice(1).map(Number);
}

function atLeast(version, minimum) {
  const current = versionParts(version);
  const required = versionParts(minimum);
  for (let index = 0; index < 3; index += 1) {
    if (current[index] > required[index]) return true;
    if (current[index] < required[index]) return false;
  }
  return true;
}

for (const [packagePath, metadata] of packageEntries) {
  const version = metadata.version;
  const major = versionParts(version)[0];
  const minimum = major >= 5 ? "5.0.8" : major === 1 ? "1.1.18" : null;

  if (!minimum || !atLeast(version, minimum)) {
    throw new Error(
      `${packagePath} is ${version}; expected a patched maintenance release (${minimum ?? "unsupported major"}).`,
    );
  }

  const packageDirectory = path.join(root, packagePath);
  const packageJson = JSON.parse(
    await readFile(path.join(packageDirectory, "package.json"), "utf8"),
  );
  const entryFile = path.join(packageDirectory, packageJson.main ?? "index.js");
  const imported = await import(pathToFileURL(entryFile).href);
  const expand =
    imported.expand ??
    imported.default?.expand ??
    (typeof imported.default === "function" ? imported.default : null);

  if (typeof expand !== "function") {
    throw new Error(`${packagePath} does not expose a usable expansion function.`);
  }

  const output = expand("{a,b}".repeat(50));
  const totalCharacters = output.reduce((total, value) => total + value.length, 0);

  if (output.length > 100_000 || totalCharacters > 4_000_000) {
    throw new Error(
      `${packagePath}@${version} did not enforce the expected expansion bounds: ${output.length} results / ${totalCharacters} characters.`,
    );
  }

  console.log(
    `Verified ${packagePath}@${version}: ${output.length} results, ${totalCharacters} characters.`,
  );
}
