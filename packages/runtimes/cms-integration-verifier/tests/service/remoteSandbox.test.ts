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
                await Bun.sleep(1_100);
                return await validSandboxResult(input);
            },
        };
        const server = startVerificationSandboxService({
            port: 0,
            verifier: createSandboxCapabilityVerifier(keys.publicKey),
            sandbox,
            maxInputBytes: 4 * 1_048_576,
            maxOutputBytes: 1_048_576,
            serverIdleTimeoutSeconds: 1,
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

    test("logs a bounded redacted cause chain without exposing it to the client", async () => {
        const keys = keyPair();
        const input = await sandboxInputFixture();
        const body = canonicalJsonBytes(input);
        const messages: string[] = [];
        const server = startVerificationSandboxService({
            port: 0,
            verifier: createSandboxCapabilityVerifier(keys.publicKey),
            sandbox: {
                identity: runnerFixture(),
                async run() {
                    throw new Error("outer", {
                        cause: new Error(
                            "Command failed at https://user:password@example.test/path token=abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJ",
                        ),
                    });
                },
            },
            maxInputBytes: 4 * 1_048_576,
            maxOutputBytes: 1_048_576,
            logFailure: (message) => messages.push(message),
        });
        servers.push(server);

        const response = await exactRequest(
            server,
            body,
            await createSandboxCapabilitySigner(keys.privateKey).issue(body),
        );
        expect(response.status).toBe(422);
        expect(await response.json()).toEqual({ code: "sandbox_failed" });
        expect(messages).toHaveLength(1);
        expect(messages[0]).toContain("integration-verification-sandbox-failed");
        expect(messages[0]).toContain("[redacted-url]");
        expect(messages[0]).not.toContain("password@example.test");
        expect(messages[0]).not.toContain("abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJ");
    });
});

describe("remote sandbox response limits", () => {
    test("disables Bun's transport idle timeout while retaining the application deadline", async () => {
        const input = await sandboxInputFixture();
        const result = await validSandboxResult(input);
        const bytes = canonicalJsonBytes(result);
        let requestInit: RequestInit | undefined;
        const remote = remoteSandbox(async (_url, init) => {
            requestInit = init;
            return new Response(Buffer.from(bytes), {
                headers: { "content-length": String(bytes.byteLength), "content-type": "application/json" },
            });
        }, bytes.byteLength);

        await expect(remote.run(input, new AbortController().signal)).resolves.toEqual(result);
        expect((requestInit as RequestInit & { timeout?: number | boolean }).timeout).toBe(false);
        expect(requestInit?.signal).toBeInstanceOf(AbortSignal);
    });

    test("cancels a response that streams beyond its declared bounded length", async () => {
        let cancelled = false;
        const response = new Response(
            new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(new Uint8Array(33));
                },
                cancel() {
                    cancelled = true;
                },
            }),
            { headers: { "content-length": "32", "content-type": "application/json" } },
        );
        const remote = remoteSandbox(async () => response, 32);

        await expect(remote.run(await sandboxInputFixture(), new AbortController().signal)).rejects.toThrow(
            /exceeds its byte limit/,
        );
        expect(cancelled).toBe(true);
    });

    test("rejects a response truncated before its declared length", async () => {
        const response = new Response(new Uint8Array([123, 125]), {
            headers: { "content-length": "4", "content-type": "application/json" },
        });
        const remote = remoteSandbox(async () => response, 32);

        await expect(remote.run(await sandboxInputFixture(), new AbortController().signal)).rejects.toThrow(
            /invalid length/,
        );
    });

    test("cancels a response with a malformed declared length before reading it", async () => {
        let cancelled = false;
        const response = new Response(
            new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(new Uint8Array([123, 125]));
                },
                cancel() {
                    cancelled = true;
                },
            }),
            { headers: { "content-length": "invalid", "content-type": "application/json" } },
        );
        const remote = remoteSandbox(async () => response, 32);

        await expect(remote.run(await sandboxInputFixture(), new AbortController().signal)).rejects.toThrow(
            /invalid length/,
        );
        expect(cancelled).toBe(true);
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

function remoteSandbox(fetchImpl: typeof fetch, maxOutputBytes: number): VerificationSandbox {
    const keys = keyPair();
    return createHttpVerificationSandbox({
        identity: runnerFixture(),
        origin: "https://sandbox.internal",
        signer: createSandboxCapabilitySigner(keys.privateKey),
        timeoutMs: 5_000,
        maxInputBytes: 4 * 1_048_576,
        maxOutputBytes,
        fetch: fetchImpl,
    });
}
