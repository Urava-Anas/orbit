import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const appRoot = path.join(root, "src", "app");
const contractPath = path.join(root, "config", "orbit-production-routes.json");
const nextConfigPath = path.join(root, "next.config.ts");
const navigationPath = path.join(root, "src", "components", "AppNavigation.tsx");
const pagePattern = /^page\.(tsx|ts|jsx|js)$/;

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return [full];
  });
}

function routeFromPage(file) {
  const relative = path.relative(appRoot, path.dirname(file));
  if (!relative) return "/";
  const segments = relative
    .split(path.sep)
    .filter(Boolean)
    .filter((segment) => !(segment.startsWith("(") && segment.endsWith(")")))
    .filter((segment) => !segment.startsWith("@"));
  return `/${segments.join("/")}`.replace(/\/+/g, "/");
}

function routeRegex(route) {
  if (route === "/") return /^\/$/;
  const parts = route.split("/").filter(Boolean).map((segment) => {
    if (/^\[\[\.\.\..+\]\]$/.test(segment)) return "(?:.*)?";
    if (/^\[\.\.\..+\]$/.test(segment)) return ".+";
    if (/^\[.+\]$/.test(segment)) return "[^/]+";
    return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  });
  return new RegExp(`^/${parts.join("/")}/?$`);
}

function colonRouteToBracketRoute(route) {
  return route.replace(/:([A-Za-z0-9_]+)/g, "[$1]");
}

if (!fs.existsSync(contractPath)) {
  console.error("Orbit architecture audit failed: route contract is missing.");
  process.exit(1);
}

const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
const canonicalRoutes = contract.routes ?? [];
const uniqueRoutes = new Set(canonicalRoutes);

if (canonicalRoutes.length !== contract.expectedCanonicalCount) {
  console.error(
    `Orbit architecture audit failed: expected ${contract.expectedCanonicalCount} canonical routes, contract contains ${canonicalRoutes.length}.`,
  );
  process.exit(1);
}

if (uniqueRoutes.size !== canonicalRoutes.length) {
  console.error("Orbit architecture audit failed: canonical route contract contains duplicates.");
  process.exit(1);
}

const implementationRoutes = walk(appRoot)
  .filter((file) => pagePattern.test(path.basename(file)))
  .map(routeFromPage);

const nextConfig = fs.readFileSync(nextConfigPath, "utf8");
const configuredSources = [...nextConfig.matchAll(/\bsource:\s*["']([^"']+)["']/g)]
  .map((match) => match[1].split("?")[0])
  .map(colonRouteToBracketRoute);

const resolvableRoutes = [...new Set([...implementationRoutes, ...configuredSources])];
const resolvableMatchers = resolvableRoutes.map((route) => ({
  route,
  regex: routeRegex(route),
}));

const missing = canonicalRoutes.filter(
  (route) => !resolvableMatchers.some(({ regex }) => regex.test(route)),
);

if (missing.length) {
  console.error("\nOrbit production architecture audit failed. Missing canonical routes:\n");
  for (const route of missing) console.error(`- ${route}`);
  process.exit(1);
}

const requiredPhysicalSaasRoutes = [
  "/organisations/select",
  "/onboarding",
  "/invite/[token]",
];
const implementationMatchers = implementationRoutes.map((route) => ({
  route,
  regex: routeRegex(route),
}));
const missingPhysical = requiredPhysicalSaasRoutes.filter(
  (route) => !implementationMatchers.some(({ regex }) => regex.test(route)),
);

if (missingPhysical.length) {
  console.error("\nOrbit architecture audit failed. Required SaaS entry flows must be physical routes:\n");
  for (const route of missingPhysical) console.error(`- ${route}`);
  process.exit(1);
}

const navigation = fs.readFileSync(navigationPath, "utf8");
const forbiddenPrimaryNavRoutes = [
  "/dashboard/leads",
  "/dashboard/sales",
  "/dashboard/foundry",
  "/dashboard/cash",
  "/dashboard/connect",
];
const staleNav = forbiddenPrimaryNavRoutes.filter((route) => navigation.includes(route));
if (staleNav.length) {
  console.error("\nOrbit architecture audit failed. Primary navigation still exposes merged/legacy routes:\n");
  for (const route of staleNav) console.error(`- ${route}`);
  process.exit(1);
}

const platformHardCoding = canonicalRoutes.filter(
  (route) => route.includes("/foundry") || route.includes("/learn") || route.includes("/student"),
);
if (platformHardCoding.length) {
  console.error("Orbit architecture audit failed: canonical contract contains vertical hard-coding.");
  process.exit(1);
}

console.log(
  `Orbit production architecture v${contract.version}: ${canonicalRoutes.length}/${contract.expectedCanonicalCount} canonical routes resolvable; 3/3 SaaS entry flows are physical; primary navigation is canonical.`,
);
