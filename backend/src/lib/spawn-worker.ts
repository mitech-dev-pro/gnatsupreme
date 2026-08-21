import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { logger } from "./logger.js";

const require = createRequire(import.meta.url);

// Runs a worker script as a separate child process (not a worker_thread) so CPU-bound work like
// large-file parsing never blocks the main API server's event loop. worker_threads were tried
// first and abandoned: Node's ESM loader hooks (how tsx makes .ts files runnable) do not reliably
// propagate into a Worker's own module resolution, even when execArgv is inherited or explicitly
// passed — confirmed empirically across several approaches. Spawning `tsx <file>.ts` as a real
// child process is exactly what running it from a terminal does, so it just works, in both dev
// (tsx CLI) and production (plain `node` against the tsc-compiled .js output).
export function spawnWorker<T>(callerUrl: string, workerBaseName: string, workerData: T, onError: (error: unknown) => void) {
  const isDev = callerUrl.endsWith(".ts");
  const extension = isDev ? ".ts" : ".js";
  const workerPath = fileURLToPath(new URL(`./${workerBaseName}${extension}`, callerUrl));

  const args = isDev
    ? [path.join(path.dirname(require.resolve("tsx/package.json")), "dist/cli.mjs"), workerPath]
    : [workerPath];

  const child = spawn(process.execPath, args, {
    stdio: ["ignore", "inherit", "inherit"],
    env: { ...process.env, WORKER_PAYLOAD: JSON.stringify(workerData) },
  });
  child.on("error", onError);
  child.on("exit", (code) => {
    if (code !== 0) logger.error({ workerBaseName, exitCode: code }, "Worker process exited with a non-zero code");
  });
  return child;
}
