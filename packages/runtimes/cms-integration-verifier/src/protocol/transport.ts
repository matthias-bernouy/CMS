import { canonicalJsonBytes, parseStrictJsonDocument } from "@bernouy/cms-integration-packages";
import { safeVerificationProtocolErrorCode, VerificationProtocolError } from "./error";

type ProtocolAuthentication = Readonly<{ kind: "worker" }> | Readonly<{ kind: "capability"; token: string }>;

export type VerificationProtocolTransportConfig = Readonly<{
    repositoryUrl: string;
    workerToken: string;
    requestTimeoutMs: number;
    maxResponseBytes: number;
    fetch?: typeof fetch;
}>;

export function createVerificationProtocolTransport(config: VerificationProtocolTransportConfig) {
    const fetchImplementation = config.fetch ?? fetch;
    return async function request(
        path: string,
        method: "GET" | "POST",
        authentication: ProtocolAuthentication,
        body?: unknown,
    ): Promise<unknown> {
        const bytes = body === undefined ? undefined : canonicalJsonBytes(body);
        const authorization = authentication.kind === "worker" ? config.workerToken : authentication.token;
        const controller = new AbortController();
        let rejectTimeout: ((reason: VerificationProtocolError) => void) | undefined;
        const timeout = new Promise<never>((_, reject) => {
            rejectTimeout = reject;
        });
        const timer = setTimeout(() => {
            controller.abort();
            rejectTimeout?.(new VerificationProtocolError("timeout", "Repository worker request timed out", true));
        }, config.requestTimeoutMs);
        try {
            const requestTask = fetchImplementation(new URL(path, config.repositoryUrl), {
                method,
                redirect: "error",
                signal: controller.signal,
                headers: {
                    accept: "application/json",
                    authorization: `Bearer ${authorization}`,
                    ...(bytes
                        ? {
                              "content-type": "application/json",
                              "content-length": String(bytes.byteLength),
                          }
                        : {}),
                },
                ...(bytes ? { body: Buffer.from(bytes) } : {}),
            });
            requestTask.catch(() => undefined);
            const response = await Promise.race([requestTask, timeout]);
            const responseBytes = await Promise.race([readBoundedBody(response, config.maxResponseBytes), timeout]);
            if (!response.ok) {
                throw httpError(response, responseBytes, config.maxResponseBytes);
            }
            const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
            if (contentType !== "application/json") {
                throw new VerificationProtocolError(
                    "invalid-response",
                    "Repository worker response is not JSON",
                    false,
                );
            }
            try {
                return parseStrictJsonDocument(responseBytes, config.maxResponseBytes);
            } catch {
                throw new VerificationProtocolError(
                    "invalid-response",
                    "Repository worker response is not valid strict JSON",
                    false,
                );
            }
        } catch (error) {
            if (error instanceof VerificationProtocolError) {
                throw error;
            }
            if (controller.signal.aborted) {
                throw new VerificationProtocolError("timeout", "Repository worker request timed out", true);
            }
            throw new VerificationProtocolError("transport", "Repository worker transport failed", true);
        } finally {
            clearTimeout(timer);
        }
    };
}

async function readBoundedBody(response: Response, limit: number): Promise<Uint8Array> {
    const declared = response.headers.get("content-length");
    if (declared && (/^[0-9]+$/u.test(declared) === false || Number(declared) > limit)) {
        await response.body?.cancel();
        throw tooLarge();
    }
    if (!response.body) {
        return new Uint8Array();
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
        for (;;) {
            const next = await reader.read();
            if (next.done) {
                break;
            }
            total += next.value.byteLength;
            if (total > limit) {
                await reader.cancel();
                throw tooLarge();
            }
            chunks.push(next.value);
        }
    } finally {
        reader.releaseLock();
    }
    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return result;
}

function httpError(response: Response, bytes: Uint8Array, limit: number): VerificationProtocolError {
    let code: string | undefined;
    try {
        const value = parseStrictJsonDocument(bytes, limit);
        if (
            value &&
            typeof value === "object" &&
            !Array.isArray(value) &&
            typeof (value as { code?: unknown }).code === "string"
        ) {
            code = safeVerificationProtocolErrorCode((value as { code: string }).code);
        }
    } catch {
        code = undefined;
    }
    const retryable =
        response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500;
    return new VerificationProtocolError(
        "http",
        "Repository worker request was rejected",
        retryable,
        response.status,
        code,
    );
}

function tooLarge(): VerificationProtocolError {
    return new VerificationProtocolError(
        "invalid-response",
        "Repository worker response exceeds its byte limit",
        false,
    );
}
