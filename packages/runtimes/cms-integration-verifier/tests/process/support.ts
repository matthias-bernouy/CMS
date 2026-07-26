import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "bun:test";
import {
    createProcessVerificationSandbox,
    type ProcessVerificationSandboxConfig,
    type VerificationSandbox,
} from "../../src";
import { runnerFixture } from "../fixtures/contracts";

export async function processSandboxFixture(
    mode: string,
    overrides: Partial<ProcessVerificationSandboxConfig> = {},
    includeSidecar = false,
) {
    const root = await mkdtemp(join(tmpdir(), "cms-verifier-test-"));
    const fixture = join(import.meta.dir, "../fixtures/sandboxChild.ts");
    const tempRoot = join(root, "sandbox");
    const sidecar = join(root, "child.pid");
    let sandbox: VerificationSandbox;
    try {
        sandbox = createProcessVerificationSandbox({
            identity: runnerFixture(),
            executable: process.execPath,
            arguments: [fixture, mode, ...(includeSidecar ? [sidecar] : [])],
            tempRoot,
            timeoutMs: 5_000,
            terminationGraceMs: 25,
            maxInputBytes: 4 * 1_048_576,
            maxOutputBytes: 1_048_576,
            maxErrorBytes: 64 * 1_024,
            environment: { PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin", LANG: "C.UTF-8" },
            ...overrides,
        });
    } catch (error) {
        await rm(root, { recursive: true, force: true });
        throw error;
    }
    return {
        root,
        sidecar,
        tempRoot,
        sandbox,
        async cleanup() {
            await rm(root, { recursive: true, force: true });
        },
    };
}

export function expectProcessGone(pid: number): void {
    expect(() => process.kill(pid, 0)).toThrow();
}
