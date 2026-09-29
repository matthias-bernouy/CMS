import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import type { ResolvedAddress } from "cms-gateway/invocation/node-http/addressPolicy";

export interface PinnedHttpRequest {
    readonly url: URL;
    readonly address: ResolvedAddress;
    readonly method: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly body?: string;
    readonly signal: AbortSignal;
}

/** Node dials the selected IP while retaining the approved URL for Host and TLS SNI. */
export async function sendPinnedHttpRequest(value: PinnedHttpRequest): Promise<Response> {
    return new Promise<Response>((resolve, reject) => {
        const request = (value.url.protocol === "https:" ? httpsRequest : httpRequest)(
            value.url,
            {
                method: value.method,
                headers: value.headers,
                signal: value.signal,
                agent: false,
                lookup: (_hostname, _options, callback) => {
                    callback(null, value.address.address, value.address.family);
                },
            },
            (incoming) => {
                try {
                    resolve(toResponse(incoming, value.method));
                } catch (error) {
                    incoming.destroy();
                    reject(error);
                }
            },
        );
        request.once("error", reject);
        request.end(value.body);
    });
}

function toResponse(incoming: IncomingMessage, method: string): Response {
    const status = incoming.statusCode;
    if (!status || status < 200 || status > 599) {
        throw new TypeError("provider returned an invalid HTTP status");
    }
    const headers = new Headers();
    for (const name of [
        "content-type",
        "x-ulvia-error-code",
        "x-ulvia-request-id",
        "retry-after",
        "etag",
        "content-disposition",
        "content-range",
        "accept-ranges",
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
            incoming.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
            incoming.once("end", () => controller.close());
            incoming.once("error", (error) => controller.error(error));
        },
        cancel() {
            incoming.destroy();
        },
    });
    return new Response(body, { status, headers });
}
