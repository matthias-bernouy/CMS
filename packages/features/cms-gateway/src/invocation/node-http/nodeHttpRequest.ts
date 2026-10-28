import { RESOURCE_HEADER } from "cms-gateway/invocation/resource/metadata";
import { request as httpRequest, type IncomingMessage, type RequestOptions } from "node:http";
import { request as httpsRequest } from "node:https";
import type { ResolvedAddress } from "cms-gateway/invocation/node-http/addressPolicy";
import { SESSION_EFFECT_HEADER } from "cms-gateway/protocol/TrustedCapabilityEffects";

export interface PinnedHttpRequest {
    readonly url: URL;
    readonly address: ResolvedAddress;
    readonly method: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly body?: string | ReadableStream<Uint8Array>;
    readonly signal: AbortSignal;
}

/** Node dials the selected IP while retaining the approved URL for Host and TLS SNI. */
export async function sendPinnedHttpRequest(value: PinnedHttpRequest): Promise<Response> {
    return new Promise<Response>((resolve, reject) => {
        const secure = value.url.protocol === "https:";
        const options: RequestOptions = {
            protocol: value.url.protocol,
            hostname: value.address.address,
            family: value.address.family,
            ...(value.url.port ? { port: value.url.port } : {}),
            path: `${value.url.pathname}${value.url.search}`,
            method: value.method,
            headers: { ...value.headers, host: value.url.host },
            signal: value.signal,
            agent: false,
            ...(secure ? { servername: value.url.hostname.replace(/^\[|\]$/g, "") } : {}),
        };
        const request = (secure ? httpsRequest : httpRequest)(options, (incoming) => {
            try {
                resolve(toResponse(incoming, value.method));
            } catch (error) {
                incoming.destroy();
                reject(error);
            }
        });
        request.once("error", reject);
        if (value.body instanceof ReadableStream) {
            void pipeBody(value.body, request).catch(reject);
        } else {
            request.end(value.body);
        }
    });
}

async function pipeBody(body: ReadableStream<Uint8Array>, request: ReturnType<typeof httpRequest>): Promise<void> {
    const reader = body.getReader();
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                request.end();
                return;
            }
            if (!request.write(value)) {
                await new Promise<void>((resolve, reject) => {
                    request.once("drain", resolve);
                    request.once("error", reject);
                });
            }
        }
    } catch (error) {
        request.destroy(error instanceof Error ? error : new Error("binary request stream failed"));
        throw error;
    } finally {
        reader.releaseLock();
    }
}

export function toResponse(incoming: IncomingMessage, method: string): Response {
    const status = incoming.statusCode;
    if (!status || status < 200 || status > 599) {
        throw new TypeError("provider returned an invalid HTTP status");
    }
    const headers = new Headers();
    for (const name of [
        "content-type",
        "x-ulvia-error-code",
        "x-ulvia-request-id",
        SESSION_EFFECT_HEADER,
        RESOURCE_HEADER,
        "retry-after",
        "etag",
        "content-disposition",
        "content-range",
        "accept-ranges",
        "cache-control",
        "content-length",
        "last-modified",
    ]) {
        const value = incoming.headers[name];
        if (typeof value === "string") {
            headers.set(name, value);
        }
    }
    const bodyless = method === "HEAD" || status === 204 || status === 205 || status === 304;
    if (bodyless) {
        incoming.resume();
        return new Response(null, { status, headers });
    }
    const body = new ReadableStream<Uint8Array>({
        start(controller) {
            incoming.on("data", (chunk: Buffer) => {
                controller.enqueue(new Uint8Array(chunk));
                if (controller.desiredSize !== null && controller.desiredSize <= 0) {
                    incoming.pause();
                }
            });
            incoming.once("end", () => controller.close());
            incoming.once("error", (error) => controller.error(error));
        },
        pull() {
            incoming.resume();
        },
        cancel() {
            incoming.destroy();
        },
    });
    return new Response(body, { status, headers });
}
