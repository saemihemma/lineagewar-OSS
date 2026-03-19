import { exec, type ChildProcess } from "node:child_process";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

// Write live.json to OS temp dir — outside the git repo, invisible to Vite's file watcher.
// A custom middleware serves it at /verifier/live.json instead.
const liveOutputPath = path.join(os.tmpdir(), "lineage-war-verifier", "live.json");

function lineageWarLiveFeedPlugin(): Plugin {
  let simulatorProcess: ChildProcess | null = null;

  return {
    name: "lineage-war-live-feed",
    configureServer(server) {
      if (process.env.VITE_DISABLE_LIVE_VERIFIER === "1" || simulatorProcess) {
        return;
      }

      const verifierDir = path.resolve(currentDir, "../../verifier");
      // Use forward slashes for the path arg — tsx runs under node which handles them fine on Windows
      const outputArg = liveOutputPath.split("\\").join("/");

      simulatorProcess = exec(
        `npx tsx src/live-simulator.ts --scenario=live-war --initial-ticks=12 --max-history=90 --interval-seconds=60 --output=${outputArg}`,
        { cwd: verifierDir },
      );
      simulatorProcess.stdout?.pipe(process.stdout);
      simulatorProcess.stderr?.pipe(process.stderr);

      const stopSimulator = () => {
        if (!simulatorProcess) {
          return;
        }
        simulatorProcess.kill();
        simulatorProcess = null;
      };

      server.httpServer?.once("close", stopSimulator);
      process.once("exit", stopSimulator);

      // Serve the live feed from outside public/ — zero Vite watcher involvement
      server.middlewares.use("/verifier/live.json", async (_req, res) => {
        try {
          const data = await readFile(liveOutputPath, "utf8");
          res.setHeader("Content-Type", "application/json");
          res.end(data);
        } catch {
          res.statusCode = 503;
          res.setHeader("Content-Type", "application/json");
          res.end("{}");
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [tailwindcss(), react(), lineageWarLiveFeedPlugin()],
  server: {
    port: 5174,
    watch: {
      // Ignore public/verifier/ so Vite never triggers a full-reload when
      // verifier data files change (e.g. from a simulator run outside of pnpm dev).
      ignored: ["**/public/verifier/**", "**/.verifier-output/**"],
    },
  },
});
