import { parseResourceMetadata } from "../resource/metadata";
import { projectSchemaValue } from "@bernouy/cms-repository/contracts/schema";
import { parseCapabilityOperationHandle } from "@bernouy/cms-repository/contracts/protocol";
import type { CapabilityDefinition } from "@bernouy/cms-repository/contracts";
import type { GatewayResult, GatewayTransportResponse } from "../interfaces/Invocation";
import { GatewayError } from "./GatewayError";

/** Validate domain outcomes independently of wire status, headers or binding selection. */
export function validateResponse(
    capability: CapabilityDefinition,
    response: GatewayTransportResponse,
    requestId: string,
): GatewayResult {
    const metadata = {
        requestId,
        ...(response.status === undefined ? {} : { status: response.status }),
        ...(response.responseHeaders ? { responseHeaders: response.responseHeaders } : {}),
    };
    try {
        if (response.errorCode !== undefined) {
            const error = capability.errors.find((item) => item.code === response.errorCode);
            if (!error || response.responseEffect || response.stream || response.bytes) {
                throw new Error("Invalid declared error");
            }
            if (!error.output && response.output !== undefined && response.output !== null) {
                throw new Error("Undeclared error output");
            }
            return {
                ...metadata,
                kind: "declared-error",
                errorCode: error.code,
                retryable: error.retryable,
                ...(error.output ? { output: projectSchemaValue(error.output, response.output) } : {}),
            };
        }
        const effect = response.responseEffect;
        if (effect && (effect.type !== "session" || !capability.responseEffects?.includes("session"))) {
            throw new Error("Undeclared response effect");
        }
        const effects = effect ? { responseEffect: effect } : {};
        if (capability.behavior.execution === "operation") {
            if (response.bytes || response.stream) {
                throw new Error("Binary operation handle");
            }
            return {
                ...metadata,
                ...effects,
                kind: "success",
                output: parseCapabilityOperationHandle(response.output),
            };
        }
        if (capability.output.type === "binary") {
            const stream =
                response.stream ?? (response.bytes ? new Blob([new Uint8Array(response.bytes)]).stream() : undefined);
            if (
                !stream ||
                response.output !== undefined ||
                !response.contentType ||
                response.contentType.length > 256 ||
                /[\r\n]/u.test(response.contentType) ||
                !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+\/[!#$%&'*+.^_`|~0-9A-Za-z-]+(?:;.*)?$/u.test(response.contentType) ||
                (response.contentLength !== undefined &&
                    (!Number.isSafeInteger(response.contentLength) ||
                        response.contentLength < 0 ||
                        response.contentLength > capability.output.maxBytes)) ||
                (response.bytes && response.bytes.byteLength > capability.output.maxBytes)
            ) {
                throw new Error("Invalid binary result");
            }
            return {
                ...metadata,
                ...effects,
                kind: "binary",
                ...(capability.output.resource ? { resource: parseResourceMetadata(response.resource) } : {}),
                stream: boundedBinary(stream, capability.output.maxBytes),
                contentType: response.contentType.split(";", 1)[0]!.trim().toLowerCase(),
                ...(response.contentLength === undefined ? {} : { contentLength: response.contentLength }),
            };
        }
        if (response.bytes || response.stream) {
            throw new Error("Unexpected binary result");
        }
        return {
            ...metadata,
            ...effects,
            kind: "success",
            output: projectSchemaValue(capability.output, response.output ?? null),
        };
    } catch {
        void response.stream?.cancel().catch(() => undefined);
        throw new GatewayError("invalid_provider_response", "provider outcome violates the selected capability");
    }
}

function boundedBinary(stream: ReadableStream<Uint8Array>, maximum: number): ReadableStream<Uint8Array> {
    const reader = stream.getReader();
    let length = 0;
    return new ReadableStream({
        async pull(controller) {
            try {
                const part = await reader.read();
                if (part.done) {
                    controller.close();
                    reader.releaseLock();
                    return;
                }
                if (!(part.value instanceof Uint8Array)) {
                    await reader.cancel("binary result contains a non-byte chunk");
                    throw new Error("Binary result contains a non-byte chunk");
                }
                length += part.value.byteLength;
                if (length > maximum) {
                    await reader.cancel("binary result exceeds capability limit");
                    throw new Error("Binary result exceeds capability limit");
                }
                controller.enqueue(part.value);
            } catch (error) {
                controller.error(error);
            }
        },
        async cancel(reason) {
            await reader.cancel(reason);
        },
    });
}
