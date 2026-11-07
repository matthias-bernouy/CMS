import { projectSchemaValue } from "@bernouy/ulvia-contracts/schema";
import { selectResponseHeaders } from "cms-gateway/protocol/http/headers";
import { parseStrictJson } from "@bernouy/ulvia-contracts/protocol";
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
            if (length > 8192) {
                return;
            }
            chunks.push(next.value);
        }
        const parsed = parseStrictJson(Buffer.concat(chunks), 8192, 4) as {
            failure?: { code?: unknown; retryable?: unknown; output?: unknown };
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
        const output =
            parsed.failure.output === undefined
                ? undefined
                : projectSchemaValue(
                      {
                          type: "object",
                          properties: { message: { type: "string", minLength: 1, maxLength: 2048 } },
                          required: ["message"],
                      },
                      parsed.failure.output,
                  );
        return new ProviderClientError(
            parsed.failure.code,
            parsed.failure.retryable,
            response.status,
            output,
            selectResponseHeaders(response.headers),
        );
    } catch {
        if (signal.aborted) {
            throw signal.reason;
        }
        return;
    } finally {
        void reader.cancel().catch(() => undefined);
    }
}
