import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import type { VerificationSandbox } from "../../supervisor";
import { parseCanonicalVerificationSandboxInput } from "../childProtocol";
import type { SandboxCapabilityVerifier } from "./capability";

export type VerificationSandboxServiceConfig = Readonly<{
    port: number;
    hostname?: string;
    verifier: SandboxCapabilityVerifier;
    sandbox: VerificationSandbox;
    maxInputBytes: number;
    maxOutputBytes: number;
    serverIdleTimeoutSeconds?: number;
    logFailure?: (message: string) => void;
}>;

export function startVerificationSandboxService(config: VerificationSandboxServiceConfig): Bun.Server<unknown> {
    let busy = false;
    return Bun.serve({
        port: config.port,
        hostname: config.hostname ?? "0.0.0.0",
        ...(config.serverIdleTimeoutSeconds === undefined ? {} : { idleTimeout: config.serverIdleTimeoutSeconds }),
        async fetch(request, server) {
            const url = new URL(request.url);
            if (request.method === "GET" && url.pathname === "/ready") {
                return Response.json({ ready: true, busy });
            }
            if (request.method !== "POST" || url.pathname !== "/v1/run") {
                return jsonError(404, "not_found");
            }
            if (busy) {
                return jsonError(409, "sandbox_busy", { "retry-after": "1" });
            }
            busy = true;
            try {
                const body = await requestBody(request, config.maxInputBytes);
                if (!body) {
                    return jsonError(400, "invalid_request");
                }
                const token = bearer(request.headers.get("authorization"));
                if (!token) {
                    return jsonError(401, "capability_required");
                }
                try {
                    await config.verifier.consume(token, body);
                } catch {
                    return jsonError(401, "capability_invalid");
                }
                const input = await parseCanonicalVerificationSandboxInput(body, config.maxInputBytes);
                server.timeout(request, 0);
                const result = await config.sandbox.run(input, request.signal);
                const bytes = canonicalJsonBytes(result);
                if (bytes.byteLength > config.maxOutputBytes) {
                    return jsonError(500, "output_limit");
                }
                return new Response(Buffer.from(bytes), {
                    status: 200,
                    headers: {
                        "content-type": "application/json",
                        "content-length": String(bytes.byteLength),
                        "cache-control": "no-store",
                    },
                });
            } catch (error) {
                logSandboxFailure(error, config.logFailure ?? console.error);
                return jsonError(422, "sandbox_failed");
            } finally {
                busy = false;
            }
        },
    });
}

function logSandboxFailure(error: unknown, log: (message: string) => void): void {
    const causes: Array<Readonly<{ name: string; message: string }>> = [];
    let current = error;
    while (current instanceof Error && causes.length < 5) {
        causes.push({ name: current.name.slice(0, 80), message: redactedErrorMessage(current.message) });
        current = current.cause;
    }
    log(JSON.stringify({ event: "integration-verification-sandbox-failed", causes }));
}

function redactedErrorMessage(message: string): string {
    return message
        .replace(/\b(?:https?|postgres(?:ql)?|mongodb):\/\/[^\s"']+/giu, "[redacted-url]")
        .replace(/\b(?:bearer|password|secret|token)\s*[=:]\s*[^\s,"']+/giu, "[redacted-credential]")
        .replace(/\b[A-Za-z0-9_-]{48,}\b/gu, "[redacted-value]")
        .slice(0, 1_024);
}

async function requestBody(request: Request, limit: number): Promise<Uint8Array | undefined> {
    if (request.headers.get("content-type")?.split(";", 1)[0] !== "application/json") {
        return undefined;
    }
    const declared = request.headers.get("content-length");
    if (!declared || !/^[0-9]+$/u.test(declared) || Number(declared) > limit || !request.body) {
        return undefined;
    }
    const expected = Number(declared);
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
        for (;;) {
            const next = await reader.read();
            if (next.done) {
                break;
            }
            total += next.value.byteLength;
            if (total > limit || total > expected) {
                await reader.cancel();
                return undefined;
            }
            chunks.push(next.value);
        }
    } finally {
        reader.releaseLock();
    }
    if (total !== expected) {
        return undefined;
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}

function bearer(header: string | null): string | undefined {
    const match = header?.match(/^Bearer ([A-Za-z0-9_.-]+)$/u);
    return match?.[1];
}

function jsonError(status: number, code: string, headers: HeadersInit = {}): Response {
    const bytes = new TextEncoder().encode(JSON.stringify({ code }));
    return new Response(bytes, {
        status,
        headers: { ...headers, "content-type": "application/json", "content-length": String(bytes.byteLength) },
    });
}
