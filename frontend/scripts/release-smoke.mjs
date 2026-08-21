import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dist = new URL("../dist/", import.meta.url);
const assets = new URL("assets/", dist);
const assetsPath = fileURLToPath(assets);
const failures = [];

if (!existsSync(dist) || !existsSync(assets)) {
  failures.push("Production output is missing. Run npm run build first.");
} else {
  const html = readFileSync(new URL("index.html", dist), "utf8");
  if (!html.includes('id="root"')) failures.push("index.html does not contain the React root.");
  if (!html.includes("/assets/index-")) failures.push("index.html does not reference the compiled entrypoint.");

  const files = readdirSync(assets);
  const criticalChunks = ["Login-", "Dashboard-", "MembersList-", "MemberDetail-", "Claims-", "Transfers-", "Reports-", "Settings-", "Setup-", "System-"];
  for (const prefix of criticalChunks) {
    if (!files.some((file) => file.startsWith(prefix) && file.endsWith(".js"))) {
      failures.push(`Missing route chunk: ${prefix}*.js`);
    }
  }

  const oversized = files
    .filter((file) => file.endsWith(".js"))
    .map((file) => ({ file, bytes: statSync(join(assetsPath, file)).size }))
    .filter(({ bytes }) => bytes > 350_000);
  for (const { file, bytes } of oversized) failures.push(`${file} exceeds the 350 kB route-bundle budget (${bytes} bytes).`);
}

if (failures.length) {
  for (const failure of failures) process.stderr.write(`FAIL: ${failure}\n`);
  process.exit(1);
}

process.stdout.write("Release smoke check passed: entrypoint, critical route chunks, and bundle budget verified.\n");
