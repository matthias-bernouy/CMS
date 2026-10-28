import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

const workspaceRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const captureRunnerUrl = new URL("./gateway/support/CaptureRunner.ts", import.meta.url).href;

describe("cms-edge public API", () => {
    test("exports the unified Edge and mounts its page fallback", () => {
        const result = Bun.spawnSync({
            cmd: [
                process.execPath,
                "-e",
                `
                    const { EdgeCms } = await import("@bernouy/cms-edge");
                    const { createContentReader, InMemoryContentRepository } = await import("@bernouy/cms-content");
                    const { TtlCache } = await import("@bernouy/http-runner");
                    const { NOOP_LOGGER } = await import("@bernouy/logging");
                    const { CaptureRunner } = await import(${JSON.stringify(captureRunnerUrl)});
                    const runner = new CaptureRunner();
                    const edge = new EdgeCms({
                        runner,
                        cache: new TtlCache(),
                        resourceHandler: async () => new Response("resource"),
                        resolveActor: async () => ({ kind: "anonymous" }),
                        robotsHandler: async () => new Response("Not Found", { status: 404 }),
                        sitemapHandler: async () => new Response("Not Found", { status: 404 }),
                        sitemapChunkHandler: async () => new Response("Not Found", { status: 404 }),
                        logger: NOOP_LOGGER,
                    });
                    if (!(edge instanceof EdgeCms) || typeof runner.defaultHandler("GET", "/") !== "function") {
                        throw new Error("cms-edge public API did not mount its fallback");
                    }
                `,
            ],
            cwd: workspaceRoot,
            stderr: "pipe",
        });

        expect(new TextDecoder().decode(result.stderr)).toBe("");
        expect(result.exitCode).toBe(0);
    });
});
