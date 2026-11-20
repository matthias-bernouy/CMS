import type { CaptureEngine } from "../interfaces/CaptureEngine";
import { CaptureError, CAPTURE_LIMITS } from "../core/limits";
import { encodeDocument, decodeResult } from "./protocol";
import { readJson, RESULT_BYTES } from "./body";

/** A filesystem-protected Unix socket is the only transport; no TCP or redirects. */
export function createUnixCaptureClient(socketPath?: string): CaptureEngine {
    return {
        async capture(document, options, signal) {
            if (!socketPath || !socketPath.startsWith("/")) {
                throw new CaptureError("UNAVAILABLE");
            }
            const timeout = AbortSignal.timeout(CAPTURE_LIMITS.timeoutMs + 5000);
            const abort = signal ? AbortSignal.any([signal, timeout]) : timeout;
            try {
                abort.throwIfAborted();
                const input = await encodeDocument(document, options);
                abort.throwIfAborted();
                const response = await fetch("http://capture.local/v1/capture", {
                    unix: socketPath,
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    redirect: "error",
                    body: JSON.stringify(input),
                    signal: abort,
                });
                const output = await readJson(response.body, RESULT_BYTES, abort);
                if (!response.ok) {
                    const error = (output as { error?: string })?.error;
                    throw new CaptureError(
                        error === "BUSY" || error === "INVALID_INPUT" || error === "LIMIT_EXCEEDED"
                            ? error
                            : "UNAVAILABLE",
                    );
                }
                return decodeResult(output);
            } catch (cause) {
                signal?.throwIfAborted();
                if (cause instanceof CaptureError) {
                    throw cause;
                }
                throw new CaptureError("UNAVAILABLE");
            }
        },
    };
}
