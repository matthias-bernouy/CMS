import { afterEach, describe, expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import {
    createHttpVerificationSandbox,
    createSandboxCapabilitySigner,
    createSandboxCapabilityVerifier,
    startVerificationSandboxService,
    type VerificationSandbox,
} from "../../src";
import { runnerFixture } from "../fixtures/contracts";
import { validSandboxResult } from "../fixtures/result";
import { sandboxInputFixture } from "../fixtures/workload";

const servers: Bun.Server<unknown>[] = [];

afterEach(() => {
    for (const server of servers.splice(0)) {
        server.stop(true);
    }
});

describe("short-lived exact sandbox capabilities", () => {
    test("binds one canonical body and rejects replay, substitution, and expiry", async () => {
        const keys = keyPair();
        const signer = createSandboxCapabilitySigner(keys.privateKey, 5_000);
        const verifier = createSandboxCapabilityVerifier(keys.publicKey);
        const first = canonicalJsonBytes({ job: "first" });
        const second = canonicalJsonBytes({ job: "second" });
        const token = await signer.issue(first, 10_000);

        await expect(verifier.consume(token, second, 10_001)).rejects.toThrow(/not exact/);
        await expect(verifier.consume(token, first, 10_001)).resolves.toBeUndefined();
        await expect(verifier.consume(token, first, 10_002)).rejects.toThrow(/replayed/);

        const expired = await signer.issue(first, 20_000);
        await expect(verifier.consume(expired, first, 25_000)).rejects.toThrow(/expired/);
    });

    test("binds the exact job, attempt, fencing token, and workload digests carried by the canonical body", async () => {
        const keys = keyPair();
        const signer = createSandboxCapabilitySigner(keys.privateKey, 5_000);
        const verifier = createSandboxCapabilityVerifier(keys.publicKey);
        const input = await sandboxInputFixture();
        const exact = canonicalJsonBytes(input);
        const substitutedFence = canonicalJsonBytes({
            ...input,
            workload: {
                ...input.workload,
                attempt: { ...input.workload.attempt, fencingToken: input.workload.attempt.fencingToken + 1 },
            },
        });
        const token = await signer.issue(exact, 10_000);

        await expect(verifier.consume(token, substitutedFence, 10_001)).rejects.toThrow(/not exact/);
        await expect(verifier.consume(token, exact, 10_001)).resolves.toBeUndefined();
    });
});

describe("fixed sandbox service", () => {
    test("executes an exact workload without receiving the repository credential", async () => {
        const keys = keyPair();
        const sandbox: VerificationSandbox = {
            identity: runnerFixture(),
            async run(input) {
                expect(process.env.CMS_INTEGRATION_VERIFIER_WORKER_TOKEN).toBeUndefined();
                return await validSandboxResult(input);
            },
        };
        const server = startVerificationSandboxService({
            port: 0,
            verifier: createSandboxCapabilityVerifier(keys.publicKey),
            sandbox,
            maxInputBytes: 4 * 1_048_576,
            maxOutputBytes: 1_048_576,
        });
        servers.push(server);
        const remote = createHttpVerificationSandbox({
            identity: runnerFixture(),
            origin: `http://127.0.0.1:${server.port}`,
            signer: createSandboxCapabilitySigner(keys.privateKey),
            timeoutMs: 5_000,
            maxInputBytes: 4 * 1_048_576,
            maxOutputBytes: 1_048_576,
        });

        const input = await sandboxInputFixture();
        const result = await remote.run(input, new AbortController().signal);
        expect(result.verification.candidateId).toBe(input.workload.admission.candidate.candidateId);

        const unauthenticated = await fetch(`http://127.0.0.1:${server.port}/v1/run`, {
            method: "POST",
            headers: { "content-type": "application/json", "content-length": "2" },
            body: "{}",
        });
        expect(unauthenticated.status).toBe(401);
    });

    test("serializes jobs and rejects concurrent work before starting another sandbox", async () => {
        const keys = keyPair();
        const input = await sandboxInputFixture();
        const body = canonicalJsonBytes(input);
        const signer = createSandboxCapabilitySigner(keys.privateKey);
        let release!: () => void;
        let entered!: () => void;
        const started = new Promise<void>((resolve) => {
            entered = resolve;
        });
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const server = startVerificationSandboxService({
            port: 0,
            verifier: createSandboxCapabilityVerifier(keys.publicKey),
            sandbox: {
                identity: runnerFixture(),
                async run(value) {
                    entered();
                    await gate;
                    return await validSandboxResult(value);
                },
            },
            maxInputBytes: 4 * 1_048_576,
            maxOutputBytes: 1_048_576,
        });
        servers.push(server);
        const first = exactRequest(server, body, await signer.issue(body));
        await started;
        const second = await exactRequest(server, body, await signer.issue(body));
        expect(second.status).toBe(409);
        expect(second.headers.get("retry-after")).toBe("1");
        release();
        expect((await first).status).toBe(200);
    });
});

function keyPair(): Readonly<{ privateKey: string; publicKey: string }> {
    const pair = generateKeyPairSync("ed25519");
    return {
        privateKey: pair.privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
        publicKey: pair.publicKey.export({ format: "pem", type: "spki" }).toString(),
    };
}

async function exactRequest(server: Bun.Server<unknown>, body: Uint8Array, capability: string): Promise<Response> {
    return await fetch(`http://127.0.0.1:${server.port}/v1/run`, {
        method: "POST",
        headers: {
            authorization: `Bearer ${capability}`,
            "content-type": "application/json",
            "content-length": String(body.byteLength),
        },
        body: Buffer.from(body),
    });
}
