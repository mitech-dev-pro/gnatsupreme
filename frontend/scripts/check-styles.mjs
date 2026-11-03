import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../src/", import.meta.url));
async function check(directory) {
  const failures = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) failures.push(...(await check(file)));
    else if (/\.(tsx?|css)$/.test(file)) {
      const lines = (await readFile(file, "utf8")).split("\n");
      lines.forEach((line, index) => {
        if (/rounded(?:-[a-z]+)?-\[/.test(line)) {
          failures.push(`${path.relative(root, file)}:${index + 1}: use a standard radius utility`);
        }
      });
    }
  }
  return failures;
}
const failures = await check(root);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else console.log("Style conventions passed.");
