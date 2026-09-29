import { decodeHttpParameter } from "@bernouy/cms-repository/contracts/bindings";
import { parseStrictJson } from "@bernouy/cms-repository/contracts/protocol";
import { GatewayError } from "../core/GatewayError";
import type { GatewayTransport, GatewayTransportRequest, GatewayTransportResponse } from "../interfaces/Invocation";
import { buildHttpInvocation, type PreparedHttpInvocation } from "./buildHttpInvocation";

export interface GatewayHttpExchange extends PreparedHttpInvocation {
    readonly requestId: string;
    readonly installationId: string;
    readonly providerTokenRef: string;
    readonly invocationOrigin: GatewayTransportRequest["invocationOrigin"];
    readonly actorKind: GatewayTransportRequest["actorKind"];
    readonly providerSubjectId?: string;
    readonly signal: AbortSignal;
    readonly accept?: string;
}

/** The host network adapter enforces target DNS/IP policy and never follows redirects. */
export interface GatewayHttpNetwork {
    exchange(request: GatewayHttpExchange): Promise<Response>;
}

export interface HttpGatewayTransportOptions {
    readonly network: GatewayHttpNetwork;
    readonly maxResponseBytes?: number;
    readonly timeoutMs?: number;
}

export class HttpGatewayTransport implements GatewayTransport {
    readonly #network: GatewayHttpNetwork;
    readonly #maxResponseBytes: number;
    readonly #timeoutMs: number;

    constructor(options: HttpGatewayTransportOptions) {
        this.#network = options.network;
        this.#maxResponseBytes = positiveBound(options.maxResponseBytes ?? 1024 * 1024, "maxResponseBytes");
        this.#timeoutMs = positiveBound(options.timeoutMs ?? 15_000, "timeoutMs");
    }

    async send(request: GatewayTransportRequest): Promise<GatewayTransportResponse> {
        const prepared = buildHttpInvocation(request);
        const signal = AbortSignal.timeout(this.#timeoutMs);
        const response = await this.#network.exchange({
            ...prepared,
            requestId: request.requestId,
            installationId: request.installationId,
            providerTokenRef: request.providerTokenRef,
            invocationOrigin: request.invocationOrigin,
            actorKind: request.actorKind,
            ...(request.providerSubjectId ? { providerSubjectId: request.providerSubjectId } : {}),
            accept:
                request.capability.output.type === "binary"
                    ? request.capability.output.mediaTypes.join(", ")
                    : "application/json",
            signal,
        });
        try {
            if (response.redirected || (response.status >= 300 && response.status < 400)) {
                throw new TypeError("provider redirects are forbidden");
            }
            const contentType = response.headers.get("content-type") ?? undefined;
            const maximum =
                request.capability.output.type === "binary" &&
                request.binding.response.successStatuses.includes(response.status)
                    ? Math.min(this.#maxResponseBytes, request.capability.output.maxBytes)
                    : this.#maxResponseBytes;
            const bytes = await readBounded(response, maximum);
            if (request.binding.response.successStatuses.includes(response.status)) {
                if (request.capability.output.type === "binary") {
                    return { status: response.status, contentType, bytes };
                }
                return {
                    status: response.status,
                    contentType,
                    output: bytes.byteLength ? parseStrictJson(bytes, this.#maxResponseBytes, 64) : null,
                };
            }
            if (request.binding.response.errorEnvelope.kind === "headers") {
                return headError(response, request, bytes);
            }
            if (contentType?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
                throw new TypeError("provider error content type is invalid");
            }
            const envelope = bytes.byteLength ? parseStrictJson(bytes, this.#maxResponseBytes, 64) : null;
            if (!envelope || typeof envelope !== "object" || Array.isArray(envelope) || !("error" in envelope)) {
                throw new TypeError("provider error envelope is invalid");
            }
            const error = envelope.error;
            if (!error || typeof error !== "object" || Array.isArray(error)) {
                throw new TypeError("provider error envelope is invalid");
            }
            const fields = error as Record<string, unknown>;
            if (typeof fields.code !== "string") {
                throw new TypeError("provider error code is invalid");
            }
            return {
                status: response.status,
                contentType,
                errorCode: fields.code,
                ...(Object.hasOwn(fields, "output") ? { output: fields.output } : {}),
            };
        } catch {
            throw new GatewayError("invalid_provider_response", "provider returned an invalid HTTP response");
        }
    }
}

function headError(response: Response, request: GatewayTransportRequest, bytes: Uint8Array): GatewayTransportResponse {
    if (bytes.byteLength) {
        throw new TypeError("HEAD error cannot contain a body");
    }
    const stringSchema = { type: "string" as const, maxLength: 128 };
    const code = decodeHttpParameter(stringSchema, response.headers.get("x-ulvia-error-code") ?? undefined);
    const requestId = decodeHttpParameter(stringSchema, response.headers.get("x-ulvia-request-id") ?? undefined);
    if (typeof code !== "string" || requestId !== request.requestId) {
        throw new TypeError("HEAD error headers are invalid");
    }
    return { status: response.status, errorCode: code };
}

async function readBounded(response: Response, maximum: number): Promise<Uint8Array> {
    const reader = response.body?.getReader();
    if (!reader) {
        return new Uint8Array();
    }
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }
        length += value.byteLength;
        if (length > maximum) {
            await reader.cancel().catch(() => undefined);
            throw new TypeError("provider response exceeds the configured byte limit");
        }
        chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}

function positiveBound(value: number, name: string): number {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new TypeError(`${name} must be a positive safe integer`);
    }
    return value;
}
