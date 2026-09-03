import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import {
    parsePinnedVerificationRunnerIdentity,
    parseCandidateAdmissionJobResult,
    parseVerificationJobResult,
    type PinnedVerificationRunnerIdentity,
} from "@bernouy/cms-integration-verification";
import type { VerificationSandbox, VerificationSandboxInput } from "../../supervisor";
import type { SandboxCapabilitySigner } from "./capability";

export type HttpVerificationSandboxConfig = Readonly<{
    identity: PinnedVerificationRunnerIdentity;
    origin: string;
    signer: SandboxCapabilitySigner;
    timeoutMs: number;
    maxInputBytes: number;
    maxOutputBytes: number;
    fetch?: typeof fetch;
}>;

export function createHttpVerificationSandbox(config: HttpVerificationSandboxConfig): VerificationSandbox {
    assertConfig(config);
    const request = config.fetch ?? fetch;
    return Object.freeze({
        identity: Object.freeze({ ...config.identity }),
        async run(input: VerificationSandboxInput, signal: AbortSignal) {
            const body = canonicalJsonBytes(input);
            if (body.byteLength > config.maxInputBytes) {
                throw new Error("Remote verification sandbox input exceeds its byte limit");
            }
            const authorization = await config.signer.issue(body);
            const timeout = AbortSignal.timeout(config.timeoutMs);
            const combined = AbortSignal.any([signal, timeout]);
            let response: Response;
            try {
                const requestInit = {
                    method: "POST",
                    redirect: "error",
                    signal: combined,
                    timeout: false,
                    headers: {
                        accept: "application/json",
                        authorization: `Bearer ${authorization}`,
                        "content-type": "application/json",
                        "content-length": String(body.byteLength),
                    },
                    body: Buffer.from(body),
                } satisfies RequestInit & Readonly<{ timeout: false }>;
                response = await request(new URL("/v1/run", config.origin), requestInit);
            } catch {
                throw new Error("Remote verification sandbox transport failed");
            }
            const bytes = await readBounded(response, config.maxOutputBytes);
            if (!response.ok || response.headers.get("content-type")?.split(";", 1)[0] !== "application/json") {
                throw new Error("Remote verification sandbox rejected the exact workload");
            }
            const result = await parseSandboxOutput(bytes);
            if (
                !sameBytes(bytes, canonicalJsonBytes(result)) &&
                !(result.migrations.length === 0 && sameBytes(bytes, canonicalJsonBytes(result.verification)))
            ) {
                throw new Error("Remote verification sandbox returned non-canonical output");
            }
            return result;
        },
    });
}

async function parseSandboxOutput(bytes: Uint8Array) {
    try {
        return await parseCandidateAdmissionJobResult(bytes);
    } catch {
        return {
            schema: "cms.integration.candidate-admission-job-result.v1" as const,
            verification: await parseVerificationJobResult(bytes),
            migrations: [],
        };
    }
}

function assertConfig(config: HttpVerificationSandboxConfig): void {
    parsePinnedVerificationRunnerIdentity(config.identity);
    const url = new URL(config.origin);
    if (url.origin !== config.origin || !["http:", "https:"].includes(url.protocol)) {
        throw new TypeError("Remote sandbox must be configured with an HTTP origin");
    }
    for (const limit of [config.timeoutMs, config.maxInputBytes, config.maxOutputBytes]) {
        if (!Number.isSafeInteger(limit) || limit < 1) {
            throw new TypeError("Remote sandbox limits must be positive integers");
        }
    }
}

async function readBounded(response: Response, limit: number): Promise<Uint8Array> {
    const declared = response.headers.get("content-length");
    const declaredLength = declared === null ? Number.NaN : Number(declared);
    if (
        !declared ||
        !/^[0-9]+$/u.test(declared) ||
        !Number.isSafeInteger(declaredLength) ||
        declaredLength > limit ||
        !response.body
    ) {
        await response.body?.cancel();
        throw new Error("Remote verification sandbox response has an invalid length");
    }
    const reader = response.body.getReader();
    const bytes = new Uint8Array(declaredLength);
    let offset = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            if (!(value instanceof Uint8Array) || value.byteLength > declaredLength - offset) {
                await reader.cancel().catch(() => undefined);
                throw new Error("Remote verification sandbox response exceeds its byte limit");
            }
            bytes.set(value, offset);
            offset += value.byteLength;
        }
        if (offset !== declaredLength) {
            await reader.cancel().catch(() => undefined);
            throw new Error("Remote verification sandbox response has an invalid length");
        }
        return bytes;
    } catch (error) {
        await reader.cancel().catch(() => undefined);
        throw error;
    } finally {
        reader.releaseLock();
    }
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
    return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}
