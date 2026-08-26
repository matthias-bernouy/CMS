import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

const workspaceRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const captureRunnerUrl = new URL("./gateway/support/CaptureRunner.ts", import.meta.url).href;

describe("cms-delivery public API", () => {
    test("exports a surface that mounts its public fallback on an injected runner", () => {
        const result = Bun.spawnSync({
            cmd: [
                process.execPath,
                "-e",
                `
                    const { DeliveryCms } = await import("@bernouy/cms-delivery");
                    const { CaptureRunner } = await import(${JSON.stringify(captureRunnerUrl)});
                    const runner = new CaptureRunner();
                    const delivery = new DeliveryCms({ runner, repository: {} });
                    if (!(delivery instanceof DeliveryCms) || typeof runner.defaultHandler("GET", "/") !== "function") {
                        throw new Error("cms-delivery public API did not mount its fallback");
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
