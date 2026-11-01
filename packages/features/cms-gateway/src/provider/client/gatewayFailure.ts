import { parseStrictJson } from "@bernouy/cms-repository/contracts/protocol";
import { withAbort } from "cms-gateway/invocation/http/transport/withAbort";
import { ProviderClientError } from "./interfaces";

/** Gateway failures are separate from a destination's declared contract error envelope. */
export async function gatewayFailure(
    response: Response,
    signal: AbortSignal,
): Promise<ProviderClientError | undefined> {
    if (response.ok || !response.headers.get("content-type")?.startsWith("application/json")) {
        return;
    }
    const reader = response.clone().body?.getReader();
    if (!reader) {
        return;
    }
    let length = 0;
    const chunks: Uint8Array[] = [];
    try {
        for (;;) {
            const next = await withAbort(() => reader.read(), signal);
            if (next.done) {
                break;
            }
            length += next.value.byteLength;
            if (length > 1024) {
                return;
            }
            chunks.push(next.value);
        }
        const parsed = parseStrictJson(Buffer.concat(chunks), 1024, 4) as {
            failure?: { code?: unknown; retryable?: unknown };
        };
        if (
            !parsed ||
            typeof parsed !== "object" ||
            !parsed.failure ||
            typeof parsed.failure.code !== "string" ||
            !/^[a-z_]{1,64}$/u.test(parsed.failure.code) ||
            typeof parsed.failure.retryable !== "boolean"
        ) {
            return;
        }
        return new ProviderClientError(parsed.failure.code, parsed.failure.retryable, response.status);
    } catch {
        if (signal.aborted) {
            throw signal.reason;
        }
        return;
    } finally {
        void reader.cancel().catch(() => undefined);
    }
}
