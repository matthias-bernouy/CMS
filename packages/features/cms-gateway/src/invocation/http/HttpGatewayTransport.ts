import { decodeHttpParameter } from "@bernouy/cms-repository/contracts/bindings";
import { parseStrictJson } from "@bernouy/cms-repository/contracts/protocol";
import { GatewayError } from "cms-gateway/invocation/core/GatewayError";
import { MAX_GATEWAY_JSON_BYTES } from "cms-gateway/invocation/core/snapshotInvocation";
import type {
    GatewayTransport,
    GatewayTransportRequest,
    GatewayTransportResponse,
} from "cms-gateway/invocation/interfaces/Invocation";
import { buildHttpInvocation, type PreparedHttpInvocation } from "cms-gateway/invocation/http/buildHttpInvocation";
import { readBounded } from "cms-gateway/invocation/http/readBounded";
import { withAbort } from "cms-gateway/invocation/http/withAbort";

export interface GatewayHttpExchange extends PreparedHttpInvocation {
    readonly contractId?: string;
    readonly requestId: string;
    readonly installationId: string;
    readonly providerTokenRef: string;
    readonly invocationOrigin: GatewayTransportRequest["invocationOrigin"];
    readonly actorKind: GatewayTransportRequest["actorKind"];
    readonly providerSubjectId?: string;
    readonly siteId: string;
    readonly idempotencyKey?: string;
    readonly callContext?: GatewayTransportRequest["callContext"];
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
    readonly maxBinaryResponseBytes?: number;
    /** Kept as an alias for firstByteTimeoutMs. */
    readonly timeoutMs?: number;
    readonly firstByteTimeoutMs?: number;
    readonly inactivityTimeoutMs?: number;
}

export class HttpGatewayTransport implements GatewayTransport {
    readonly #network: GatewayHttpNetwork;
    readonly #maxResponseBytes: number;
    readonly #maxBinaryResponseBytes: number;
    readonly #timeoutMs: number;
    readonly #inactivityTimeoutMs: number;

    constructor(options: HttpGatewayTransportOptions) {
        this.#network = options.network;
        this.#maxResponseBytes = positiveBound(options.maxResponseBytes ?? MAX_GATEWAY_JSON_BYTES, "maxResponseBytes");
        this.#maxBinaryResponseBytes = positiveBound(
            options.maxBinaryResponseBytes ?? 10 * 1024 * 1024 * 1024,
            "maxBinaryResponseBytes",
        );
        this.#timeoutMs = positiveBound(
            options.firstByteTimeoutMs ?? options.timeoutMs ?? 15_000,
            "firstByteTimeoutMs",
        );
        this.#inactivityTimeoutMs = positiveBound(options.inactivityTimeoutMs ?? 15_000, "inactivityTimeoutMs");
    }

    async send(request: GatewayTransportRequest): Promise<GatewayTransportResponse> {
        const prepared = buildHttpInvocation(request);
        const abort = new AbortController();
        const signal = abort.signal;
        const firstByteTimeout = setTimeout(
            () => abort.abort(new DOMException("Provider first byte timed out", "TimeoutError")),
            this.#timeoutMs,
        );
        const exchange: GatewayHttpExchange = {
            ...prepared,
            contractId: request.release.contractId,
            requestId: request.requestId,
            installationId: request.installationId,
            providerTokenRef: request.providerTokenRef,
            invocationOrigin: request.invocationOrigin,
            actorKind: request.actorKind,
            siteId: request.siteId,
            ...(request.providerSubjectId ? { providerSubjectId: request.providerSubjectId } : {}),
            ...(request.idempotencyKey ? { idempotencyKey: request.idempotencyKey } : {}),
            ...(request.callContext ? { callContext: request.callContext } : {}),
            accept:
                request.binding.response.kind === "operation-handle"
                    ? "application/json"
                    : request.capability.output.type === "binary"
                      ? "*/*"
                      : "application/json",
            signal,
        };
        let response: Response;
        try {
            response = await withAbort(() => this.#network.exchange(exchange), signal);
        } catch (error) {
            clearTimeout(firstByteTimeout);
            throw error;
        }
        try {
            if (response.redirected || (response.status >= 300 && response.status < 400)) {
                throw new TypeError("provider redirects are forbidden");
            }
            const contentType = response.headers.get("content-type") ?? undefined;
            const responseHeaders = allowedResponseHeaders(response.headers);
            const maximum =
                request.binding.response.kind !== "operation-handle" &&
                request.capability.output.type === "binary" &&
                request.binding.response.successStatuses.includes(response.status)
                    ? Math.min(this.#maxBinaryResponseBytes, request.capability.output.maxBytes)
                    : this.#maxResponseBytes;
            const isBinarySuccess =
                request.binding.response.kind !== "operation-handle" &&
                request.capability.output.type === "binary" &&
                request.binding.response.successStatuses.includes(response.status);
            if (isBinarySuccess) {
                const contentLength = parseContentLength(response.headers.get("content-length"), maximum);
                const prefetched =
                    request.binding.method === "HEAD"
                        ? emptyPrefetch(response.body)
                        : await prefetchBody(response.body, signal, contentLength);
                clearTimeout(firstByteTimeout);
                return {
                    status: response.status,
                    contentType,
                    stream: boundedStream(prefetched, maximum, abort, this.#inactivityTimeoutMs),
                    ...(contentLength === undefined ? {} : { contentLength }),
                    responseHeaders,
                };
            }
            const bytes = await readBounded(response, maximum, signal);
            clearTimeout(firstByteTimeout);
            if (request.binding.response.successStatuses.includes(response.status)) {
                return {
                    status: response.status,
                    contentType,
                    responseHeaders,
                    output: bytes.byteLength ? parseStrictJson(bytes, this.#maxResponseBytes, 64) : null,
                };
            }
            if (request.binding.response.errorEnvelope.kind === "headers") {
                return { ...headError(response, request, bytes), responseHeaders };
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
                responseHeaders,
                errorCode: fields.code,
                ...(Object.hasOwn(fields, "output") ? { output: fields.output } : {}),
            };
        } catch {
            clearTimeout(firstByteTimeout);
            if (signal.aborted) {
                throw signal.reason;
            }
            throw new GatewayError("invalid_provider_response", "provider returned an invalid HTTP response");
        }
    }
}

function allowedResponseHeaders(headers: Headers): Readonly<Record<string, string>> {
    const values: Record<string, string> = {};
    for (const name of [
        "retry-after",
        "etag",
        "content-disposition",
        "content-range",
        "accept-ranges",
        "cache-control",
        "last-modified",
    ]) {
        const value = headers.get(name);
        if (value !== null) {
            if (value.length > 1024 || /[\x00-\x1f\x7f]/.test(value)) {
                throw new TypeError("provider response header is invalid");
            }
            values[name] = value;
        }
    }
    return Object.freeze(values);
}

function parseContentLength(value: string | null, maximum: number): number | undefined {
    if (value === null) {
        return undefined;
    }
    const length = Number(value);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(length) || length < 0 || length > maximum) {
        throw new TypeError("provider content length is invalid");
    }
    return length;
}

function boundedStream(
    prefetched: PrefetchedBody,
    maximum: number,
    abort: AbortController,
    inactivityTimeoutMs: number,
): ReadableStream<Uint8Array> {
    if (!prefetched.reader) {
        return new ReadableStream({ start: (controller) => controller.close() });
    }
    const reader = prefetched.reader;
    const signal = abort.signal;
    let length = 0;
    let first = prefetched.first;
    return new ReadableStream<Uint8Array>({
        async pull(controller) {
            if (signal.aborted) {
                await reader.cancel(signal.reason).catch(() => undefined);
                controller.error(signal.reason);
                return;
            }
            try {
                const next = first ?? (await readWithTimeout(reader, inactivityTimeoutMs, abort));
                first = undefined;
                const { done, value } = next;
                if (done) {
                    controller.close();
                    return;
                }
                length += value.byteLength;
                if (length > maximum) {
                    abort.abort(new TypeError("provider response exceeds gateway limit"));
                    await reader.cancel("response exceeds gateway limit").catch(() => undefined);
                    controller.error(new TypeError("provider response exceeds gateway limit"));
                    return;
                }
                controller.enqueue(value);
            } catch (error) {
                controller.error(error);
            }
        },
        async cancel(reason) {
            abort.abort(reason);
            await reader.cancel(reason).catch(() => undefined);
        },
    });
}

type PrefetchedBody = {
    readonly reader?: ReadableStreamDefaultReader<Uint8Array>;
    readonly first?:
        | { readonly done: false; readonly value: Uint8Array }
        | { readonly done: true; readonly value?: Uint8Array };
};

function emptyPrefetch(body: ReadableStream<Uint8Array> | null): PrefetchedBody {
    if (body) {
        void body.cancel();
    }
    return {};
}

async function prefetchBody(
    body: ReadableStream<Uint8Array> | null,
    signal: AbortSignal,
    contentLength: number | undefined,
): Promise<PrefetchedBody> {
    if (!body) {
        if (contentLength && contentLength > 0) {
            throw new TypeError("provider closed before its first response byte");
        }
        return {};
    }
    const reader = body.getReader();
    try {
        const first = await withAbort(() => reader.read(), signal);
        if (first.done && contentLength && contentLength > 0) {
            throw new TypeError("provider closed before its first response byte");
        }
        return { reader, first };
    } catch (error) {
        await reader.cancel(error).catch(() => undefined);
        throw error;
    }
}

async function readWithTimeout(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    timeoutMs: number,
    abort: AbortController,
) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            reader.read(),
            new Promise<never>((_resolve, reject) => {
                timer = setTimeout(() => {
                    const error = new DOMException("Provider stream was inactive", "TimeoutError");
                    abort.abort(error);
                    reject(error);
                }, timeoutMs);
            }),
        ]);
    } finally {
        if (timer !== undefined) {
            clearTimeout(timer);
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

function positiveBound(value: number, name: string): number {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new TypeError(`${name} must be a positive safe integer`);
    }
    return value;
}
