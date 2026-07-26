import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import {
    parsePinnedVerificationRunnerIdentity,
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
                response = await request(new URL("/v1/run", config.origin), {
                    method: "POST",
                    redirect: "error",
                    signal: combined,
                    headers: {
                        accept: "application/json",
                        authorization: `Bearer ${authorization}`,
                        "content-type": "application/json",
                        "content-length": String(body.byteLength),
                    },
                    body: Buffer.from(body),
                });
            } catch {
                throw new Error("Remote verification sandbox transport failed");
            }
            const bytes = await readBounded(response, config.maxOutputBytes);
            if (!response.ok || response.headers.get("content-type")?.split(";", 1)[0] !== "application/json") {
                throw new Error("Remote verification sandbox rejected the exact workload");
            }
            const result = await parseVerificationJobResult(bytes);
            if (!sameBytes(bytes, canonicalJsonBytes(result))) {
                throw new Error("Remote verification sandbox returned non-canonical output");
            }
            return result;
        },
    });
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
    if (!declared || !/^[0-9]+$/u.test(declared) || Number(declared) > limit || !response.body) {
        await response.body?.cancel();
        throw new Error("Remote verification sandbox response has an invalid length");
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength !== Number(declared) || bytes.byteLength > limit) {
        throw new Error("Remote verification sandbox response exceeds its byte limit");
    }
    return bytes;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
    return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}
