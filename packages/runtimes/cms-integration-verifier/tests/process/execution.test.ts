import { afterEach, describe, expect, test } from "bun:test";
import { readFile, readdir } from "node:fs/promises";
import { ProcessVerificationSandboxError } from "../../src";
import { sandboxInputFixture } from "../fixtures/workload";
import { expectProcessGone, processSandboxFixture } from "./support";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
    delete process.env.CMS_INTEGRATION_VERIFIER_WORKER_TOKEN;
    delete process.env.REPOSITORY_CAPABILITY_SIGNING_KEY;
    await Promise.all(cleanups.splice(0).map(async (cleanup) => await cleanup()));
});

describe("local process verification sandbox", () => {
    test("uses canonical stdio, an isolated directory, and an explicit secret-free environment", async () => {
        process.env.CMS_INTEGRATION_VERIFIER_WORKER_TOKEN = "worker-token-must-not-cross";
        process.env.REPOSITORY_CAPABILITY_SIGNING_KEY = "signing-key-must-not-cross";
        const fixture = await trackedFixture("inspect-env");

        const result = await fixture.sandbox.run(await sandboxInputFixture(), new AbortController().signal);

        const diagnostic = result.verification.results[0]!.diagnostics[0]!;
        expect(diagnostic.code).toBe("sandbox-environment");
        const environment = JSON.parse(diagnostic.message) as Record<string, string>;
        expect(environment.CMS_INTEGRATION_VERIFIER_WORKER_TOKEN).toBeUndefined();
        expect(environment.REPOSITORY_CAPABILITY_SIGNING_KEY).toBeUndefined();
        expect(JSON.stringify(environment)).not.toContain("worker-token-must-not-cross");
        expect(JSON.stringify(environment)).not.toContain("signing-key-must-not-cross");
        expect(environment.HOME).toStartWith(fixture.tempRoot);
        expect(environment.TMPDIR).toBe(environment.HOME);
        expect(await readdir(fixture.tempRoot)).toEqual([]);
    });

    test("kills a process group that ignores SIGTERM after the hard timeout", async () => {
        const fixture = await trackedFixture("hang", { timeoutMs: 500, terminationGraceMs: 25 }, true);

        await expect(
            fixture.sandbox.run(await sandboxInputFixture(), new AbortController().signal),
        ).rejects.toMatchObject<Partial<ProcessVerificationSandboxError>>({ code: "timeout" });

        const pid = Number(await readFile(fixture.sidecar, "utf8"));
        expectProcessGone(pid);
        expect(await readdir(fixture.tempRoot)).toEqual([]);
    });

    test("kills a child whose stdout exceeds the configured bound", async () => {
        const fixture = await trackedFixture("output", { maxOutputBytes: 1_024 }, true);

        await expect(
            fixture.sandbox.run(await sandboxInputFixture(), new AbortController().signal),
        ).rejects.toMatchObject<Partial<ProcessVerificationSandboxError>>({ code: "output-limit" });

        const pid = Number(await readFile(fixture.sidecar, "utf8"));
        expectProcessGone(pid);
        expect(await readdir(fixture.tempRoot)).toEqual([]);
    });

    test("kills an untrusted descendant even when its successful parent already exited", async () => {
        const fixture = await trackedFixture("orphan", { terminationGraceMs: 25 }, true);

        await expect(
            fixture.sandbox.run(await sandboxInputFixture(), new AbortController().signal),
        ).resolves.toBeObject();

        const pid = Number(await readFile(fixture.sidecar, "utf8"));
        expectProcessGone(pid);
        expect(await readdir(fixture.tempRoot)).toEqual([]);
    });

    test("maps an unavailable executable to a bounded launch failure", async () => {
        const fixture = await trackedFixture("unused", { executable: "/missing/private/verifier-secret" });

        await expect(
            fixture.sandbox.run(await sandboxInputFixture(), new AbortController().signal),
        ).rejects.toMatchObject<Partial<ProcessVerificationSandboxError>>({ code: "launch-failed" });
    });

    test("retains only redacted bounded stderr for a failed child", async () => {
        const fixture = await trackedFixture("failure-diagnostic");

        const error = await fixture.sandbox
            .run(await sandboxInputFixture(), new AbortController().signal)
            .catch((failure) => failure as ProcessVerificationSandboxError);

        expect(error.code).toBe("process-failed");
        expect((error.cause as Error).message).toContain("[redacted-url]");
        expect((error.cause as Error).message).not.toContain("password@example.test");
        expect((error.cause as Error).message).not.toContain("abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJ");
    });

    test("rejects argument and environment channels that could carry ambient secrets", async () => {
        await expect(
            processSandboxFixture("unused", { environment: { WORKER_TOKEN: "must-not-cross" } }),
        ).rejects.toThrow(/forbidden entry/);
        await expect(processSandboxFixture("unused", { arguments: ["value\0secret"] })).rejects.toThrow(
            /arguments are invalid/,
        );
    });
});

async function trackedFixture(
    mode: string,
    overrides = {},
    includeSidecar = false,
): ReturnType<typeof processSandboxFixture> {
    const fixture = await processSandboxFixture(mode, overrides, includeSidecar);
    cleanups.push(fixture.cleanup);
    return fixture;
}
