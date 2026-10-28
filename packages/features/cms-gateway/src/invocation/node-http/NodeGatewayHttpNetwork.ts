import {
    DELEGATION_HEADER,
    PROVIDER_AUTHORITY_HEADER,
    validDelegationTicket,
    type ProviderWireAuthority,
} from "cms-gateway/access/delegation/wire";
import { currentRequestId } from "@bernouy/http-runner/observability";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import {
    assertProviderInvocationSecret,
    signProviderInvocationToken,
} from "cms-gateway/protocol/ProviderInvocationToken";
import type {
    GatewayHttpExchange,
    GatewayHttpNetwork,
} from "cms-gateway/invocation/http/transport/HttpGatewayTransport";
import { withAbort } from "cms-gateway/invocation/http/transport/withAbort";
import {
    isLoopbackLiteral,
    selectGatewayAddress,
    type ResolvedAddress,
} from "cms-gateway/invocation/node-http/addressPolicy";
import { sendPinnedHttpRequest, type PinnedHttpRequest } from "cms-gateway/invocation/node-http/nodeHttpRequest";
import { ACTOR_CREDENTIAL_HEADER, encodeActorCredential } from "cms-gateway/protocol/TrustedCapabilityEffects";

export type GatewayHttpAuthorization = Readonly<{
    token: string;
    delegationTicket?: string;
    providerAuthority?: ProviderWireAuthority;
}>;

export interface NodeGatewayHttpNetworkOptions {
    /** Resolves a host-owned credential reference without exposing its value to the gateway core. */
    readonly resolveToken?: (reference: string) => Promise<string>;
    /** Delegates creation of the exact outbound Bearer without exposing a durable Provider credential. */
    readonly authorize?: (request: GatewayHttpExchange) => Promise<GatewayHttpAuthorization>;
    /** Opt-in for a runtime whose selected Providers live on its controlled private network. */
    readonly allowPrivateAddresses?: boolean;
    readonly resolveAddresses?: (hostname: string) => Promise<readonly ResolvedAddress[]>;
    readonly sendPinned?: (request: PinnedHttpRequest) => Promise<Response>;
}

export class NodeGatewayHttpNetwork implements GatewayHttpNetwork {
    readonly #options: NodeGatewayHttpNetworkOptions;

    constructor(options: NodeGatewayHttpNetworkOptions) {
        if (Boolean(options.resolveToken) === Boolean(options.authorize)) {
            throw new TypeError("exactly one Provider authorization strategy is required");
        }
        this.#options = options;
    }

    async exchange(request: GatewayHttpExchange): Promise<Response> {
        const origin = new URL(request.origin);
        if (
            origin.origin !== request.origin ||
            (origin.protocol !== "https:" &&
                !(
                    origin.protocol === "http:" &&
                    (isLoopbackLiteral(origin.hostname) || this.#options.allowPrivateAddresses)
                ))
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
        const address = selectGatewayAddress(origin, addresses, this.#options.allowPrivateAddresses);
        const authorization = await withAbort(() => this.#authorization(request), request.signal);
        return (this.#options.sendPinned ?? sendPinnedHttpRequest)({
            url,
            address,
            method: request.method,
            headers: trustedHeaders(request, authorization),
            ...(request.body === undefined ? {} : { body: request.body }),
            signal: request.signal,
        });
    }

    async #authorization(request: GatewayHttpExchange): Promise<GatewayHttpAuthorization> {
        if (this.#options.authorize) {
            if (request.authentication.kind !== "capability") {
                throw new TypeError("brokered Provider authorization is restricted to capability invocations");
            }
            const authorization = await this.#options.authorize(request);
            if (
                !authorization ||
                typeof authorization.token !== "string" ||
                !authorization.token ||
                authorization.token.length > 4096 ||
                /[\x00-\x20\x7f]/.test(authorization.token) ||
                (authorization.providerAuthority !== undefined &&
                    authorization.providerAuthority !== "provider" &&
                    authorization.providerAuthority !== "delegated") ||
                (authorization.providerAuthority === "delegated") !== (authorization.delegationTicket !== undefined) ||
                (authorization.delegationTicket !== undefined && !validDelegationTicket(authorization.delegationTicket))
            ) {
                throw new TypeError("provider authorization is unavailable");
            }
            return authorization;
        }
        const token = await this.#options.resolveToken!(request.providerTokenRef);
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
                      ...(request.authentication.rootRequestId
                          ? { rootRequestId: request.authentication.rootRequestId }
                          : {}),
                      ...(request.authentication.delegation
                          ? {
                                delegationTicket: request.authentication.delegation.ticket,
                                delegationExpiresAt: request.authentication.delegation.expiresAt,
                            }
                          : {}),
                      ...(request.authentication.subjectId ? { subjectId: request.authentication.subjectId } : {}),
                      ...(request.authentication.systemServiceId
                          ? { systemServiceId: request.authentication.systemServiceId }
                          : {}),
                      ...(request.authentication.sourceInstallationId
                          ? { sourceInstallationId: request.authentication.sourceInstallationId }
                          : {}),
                      ...(request.installationId ? { connectionId: request.installationId } : {}),
                      issuedAt: nowSeconds,
                      expiresAt: nowSeconds + 30,
                  });
        return { token: authorization };
    }
}

const PROVIDER_CONTROL_PATHS = new Set(["/ulvia/report"]);

async function defaultResolveAddresses(hostname: string): Promise<readonly ResolvedAddress[]> {
    const family = isIP(hostname);
    if (family === 4 || family === 6) {
        return [{ address: hostname, family }];
    }
    const resolved = await lookup(hostname, { all: true, verbatim: true });
    return resolved.filter((entry): entry is ResolvedAddress => entry.family === 4 || entry.family === 6);
}

function trustedHeaders(request: GatewayHttpExchange, authorization: GatewayHttpAuthorization): Record<string, string> {
    return {
        ...request.headers,
        accept: request.accept ?? "application/json",
        authorization: `Bearer ${authorization.token}`,
        ...(authorization.providerAuthority ? { [PROVIDER_AUTHORITY_HEADER]: authorization.providerAuthority } : {}),
        ...(authorization.delegationTicket ? { [DELEGATION_HEADER]: authorization.delegationTicket } : {}),
        "x-ulvia-request-id": request.requestId,
        ...(currentRequestId() ? { "x-request-id": currentRequestId()! } : {}),
        ...(request.idempotencyKey ? { "idempotency-key": request.idempotencyKey } : {}),
        ...(request.actorCredential
            ? { [ACTOR_CREDENTIAL_HEADER]: encodeActorCredential(request.actorCredential) }
            : {}),
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
