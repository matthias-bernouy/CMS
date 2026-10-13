import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import {
    assertProviderInvocationSecret,
    signProviderInvocationToken,
} from "cms-gateway/protocol/ProviderInvocationToken";
import type { GatewayHttpExchange, GatewayHttpNetwork } from "cms-gateway/invocation/http/HttpGatewayTransport";
import { withAbort } from "cms-gateway/invocation/http/withAbort";
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
        if (
            request.authentication.kind === "provider-control" &&
            (request.method !== "GET" || !PROVIDER_CONTROL_PATHS.has(request.pathAndQuery))
        ) {
            throw new TypeError("provider control credential is restricted to Provider metadata endpoints");
        }
        assertSafeApplicationHeaders(request);
        const hostname = origin.hostname.replace(/^\[|\]$/g, "");
        const addresses = await withAbort(
            () => (this.#options.resolveAddresses ?? defaultResolveAddresses)(hostname),
            request.signal,
        );
        const address = selectGatewayAddress(origin, addresses);
        const token = await withAbort(() => this.#options.resolveToken(request.providerTokenRef), request.signal);
        try {
            assertProviderInvocationSecret(token);
        } catch {
            throw new TypeError("provider credential is unavailable");
        }
        const nowSeconds = Math.floor(Date.now() / 1_000);
        const authorization =
            request.authentication.kind === "provider-control"
                ? token
                : signProviderInvocationToken(token, {
                      version: 1,
                      requestId: request.requestId,
                      instanceId: request.authentication.instanceId,
                      contractId: request.authentication.contractId,
                      contractVersion: request.authentication.contractVersion,
                      capabilityId: request.authentication.capabilityId,
                      ...(request.authentication.subjectId ? { subjectId: request.authentication.subjectId } : {}),
                      issuedAt: nowSeconds,
                      expiresAt: nowSeconds + 30,
                  });
        return (this.#options.sendPinned ?? sendPinnedHttpRequest)({
            url,
            address,
            method: request.method,
            headers: trustedHeaders(request, authorization),
            ...(request.body === undefined ? {} : { body: request.body }),
            signal: request.signal,
        });
    }
}

const PROVIDER_CONTROL_PATHS = new Set(["/ulvia/report", "/ulvia/kernel/v1/handshake"]);

async function defaultResolveAddresses(hostname: string): Promise<readonly ResolvedAddress[]> {
    const family = isIP(hostname);
    if (family === 4 || family === 6) {
        return [{ address: hostname, family }];
    }
    const resolved = await lookup(hostname, { all: true, verbatim: true });
    return resolved.filter((entry): entry is ResolvedAddress => entry.family === 4 || entry.family === 6);
}

function trustedHeaders(request: GatewayHttpExchange, authorization: string): Record<string, string> {
    return {
        ...request.headers,
        accept: request.accept ?? "application/json",
        authorization: `Bearer ${authorization}`,
        "x-ulvia-request-id": request.requestId,
        ...(request.idempotencyKey ? { "idempotency-key": request.idempotencyKey } : {}),
        ...(request.contentLength === undefined ? {} : { "content-length": String(request.contentLength) }),
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
            (name === "content-type" && request.body === undefined)
        ) {
            throw new TypeError("provider binding supplied a forbidden header");
        }
    }
}
