import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { GatewayHttpExchange, GatewayHttpNetwork } from "cms-gateway/invocation/http/HttpGatewayTransport";
import {
    isLoopbackLiteral,
    selectGatewayAddress,
    type ResolvedAddress,
} from "cms-gateway/invocation/node-http/addressPolicy";
import { sendPinnedHttpRequest, type PinnedHttpRequest } from "cms-gateway/invocation/node-http/nodeHttpRequest";

export interface NodeGatewayHttpNetworkOptions {
    /** Resolves a host-owned credential reference without exposing its value to the gateway core. */
    readonly resolveToken: (reference: string) => Promise<string>;
    readonly resolveAddresses?: (hostname: string) => Promise<readonly ResolvedAddress[]>;
    readonly sendPinned?: (request: PinnedHttpRequest) => Promise<Response>;
}

export class NodeGatewayHttpNetwork implements GatewayHttpNetwork {
    readonly #options: NodeGatewayHttpNetworkOptions;

    constructor(options: NodeGatewayHttpNetworkOptions) {
        this.#options = options;
    }

    async exchange(request: GatewayHttpExchange): Promise<Response> {
        const origin = new URL(request.origin);
        if (
            origin.origin !== request.origin ||
            (origin.protocol !== "https:" && !(origin.protocol === "http:" && isLoopbackLiteral(origin.hostname)))
        ) {
            throw new TypeError("provider origin is invalid");
        }
        const url = new URL(request.pathAndQuery, origin);
        if (!request.pathAndQuery.startsWith("/") || url.origin !== origin.origin || url.hash) {
            throw new TypeError("provider request path is invalid");
        }
        assertSafeApplicationHeaders(request);
        const hostname = origin.hostname.replace(/^\[|\]$/g, "");
        const addresses = await (this.#options.resolveAddresses ?? defaultResolveAddresses)(hostname);
        const address = selectGatewayAddress(origin, addresses);
        const token = await this.#options.resolveToken(request.providerTokenRef);
        if (!/^[\x21-\x7e]{1,4096}$/.test(token)) {
            throw new TypeError("provider credential is unavailable");
        }
        return (this.#options.sendPinned ?? sendPinnedHttpRequest)({
            url,
            address,
            method: request.method,
            headers: trustedHeaders(request, token),
            ...(request.body === undefined ? {} : { body: request.body }),
            signal: request.signal,
        });
    }
}

async function defaultResolveAddresses(hostname: string): Promise<readonly ResolvedAddress[]> {
    const family = isIP(hostname);
    if (family === 4 || family === 6) {
        return [{ address: hostname, family }];
    }
    const resolved = await lookup(hostname, { all: true, verbatim: true });
    return resolved.filter((entry): entry is ResolvedAddress => entry.family === 4 || entry.family === 6);
}

function trustedHeaders(request: GatewayHttpExchange, token: string): Record<string, string> {
    return {
        ...request.headers,
        accept: request.accept ?? "application/json",
        authorization: `Bearer ${token}`,
        "x-ulvia-request-id": request.requestId,
        "x-ulvia-origin": request.invocationOrigin,
        "x-ulvia-actor-kind": request.actorKind,
        ...(request.providerSubjectId ? { "x-ulvia-subject-id": request.providerSubjectId } : {}),
    };
}

const RESERVED_HEADERS = new Set([
    "accept",
    "accept-encoding",
    "authorization",
    "baggage",
    "connection",
    "content-encoding",
    "content-length",
    "cookie",
    "expect",
    "forwarded",
    "host",
    "idempotency-key",
    "keep-alive",
    "origin",
    "proxy-authorization",
    "referer",
    "te",
    "trailer",
    "traceparent",
    "tracestate",
    "transfer-encoding",
    "upgrade",
    "user-agent",
    "via",
    "x-real-ip",
]);

function assertSafeApplicationHeaders(request: GatewayHttpExchange): void {
    for (const [name, value] of Object.entries(request.headers)) {
        if (
            name !== name.toLowerCase() ||
            !/^[a-z0-9!#$%&'*+.^_`|~-]+$/.test(name) ||
            typeof value !== "string" ||
            /[\r\n]/.test(value) ||
            RESERVED_HEADERS.has(name) ||
            ["proxy-", "sec-", "x-cms-", "x-forwarded-", "x-ulvia-"].some((prefix) => name.startsWith(prefix)) ||
            (name === "content-type" && (request.body === undefined || value !== "application/json"))
        ) {
            throw new TypeError("provider binding supplied a forbidden header");
        }
    }
}
