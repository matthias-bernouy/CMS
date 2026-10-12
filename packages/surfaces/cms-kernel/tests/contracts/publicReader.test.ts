import { expect, test } from "bun:test";
import { resolve } from "node:path";

test("Kernel requires one writable repository while public rendering stays read-only", () => {
    const result = Bun.spawnSync({
        cmd: ["bun", "run", "tsc", "--project", resolve(import.meta.dir, "tsconfig.json")],
        cwd: resolve(import.meta.dir, "../../../../.."),
        stdout: "pipe",
        stderr: "pipe",
    });
    expect(new TextDecoder().decode(result.stdout) + new TextDecoder().decode(result.stderr)).toBe("");
    expect(result.exitCode).toBe(0);
}, 30000);
