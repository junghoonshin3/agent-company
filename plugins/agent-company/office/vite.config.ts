// Agent Company 내장 오피스 대시보드의 Vite 설정과 로컬 상태 API를 연결한다.
import react from "@vitejs/plugin-react";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import { readOfficeState } from "./server/companyState";
import { createOfficeStateEventHub } from "./server/stateEvents";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(appDir, "../../..");

function agentOfficeStateApi(): Plugin {
  const stateEventHub = createOfficeStateEventHub(projectRoot);

  return {
    name: "agent-office-state-api",
    configureServer(server) {
      server.middlewares.use("/api/company/state", async (request, response, next) => {
        if (request.method !== "GET") {
          next();
          return;
        }

        try {
          const state = await readOfficeState(projectRoot);
          response.statusCode = 200;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(JSON.stringify(state));
        } catch (error) {
          response.statusCode = 500;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(JSON.stringify({
            error: error instanceof Error ? error.message : "Unknown state API error",
          }));
        }
      });

      server.middlewares.use("/api/company/events", async (request, response, next) => {
        if (request.method !== "GET") {
          next();
          return;
        }

        await stateEventHub.handle(request, response);
      });

      server.httpServer?.once("close", () => {
        stateEventHub.close();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), agentOfficeStateApi()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}", "server/**/*.test.ts"],
  },
});
