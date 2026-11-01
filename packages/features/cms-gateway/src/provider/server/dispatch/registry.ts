import { runWithTraceContext } from "@bernouy/logging/tracing";
import type { TraceContext } from "@bernouy/logging";
import type { DelegationContext } from "cms-gateway/access/delegation/interfaces";
import type { ResolvedContract } from "@bernouy/cms-repository/contracts";
import type { GatewayActorCredential } from "cms-gateway/exports/protocol";
import { hydrateProviderInvocationContext, type ProviderHttpContext } from "./httpContext";

/** Verified invocation metadata. Site and provider identity are injected by the runtime. */
export interface ProviderCapabilityInvocationContext {
    readonly http?: ProviderHttpContext;
    readonly signal?: AbortSignal;
    /** Serializable transport snapshot; use http.headers in handlers. */
    readonly requestContext?: GatewayRequestContext;
    readonly trace?: TraceContext;
    readonly actorKind?: "anonymous" | "user" | "administrator";
    readonly delegation?: DelegationContext;
    readonly rootRequestId?: string;
    readonly requestId: string;
    readonly contractVersion: string;
    readonly siteId: string;
    readonly providerId: string;
    readonly subjectId?: string;
    readonly systemServiceId?: string;
    readonly sourceInstallationId?: string;
    readonly connectionId?: string;
    readonly controlAuthority?: true;
    readonly idempotencyKey?: string;
    readonly actorCredential?: GatewayActorCredential;
    readonly binaryBody?: {
        readonly stream: ReadableStream<Uint8Array>;
        readonly contentType?: string;
        readonly contentLength?: number;
    };
}

export type ProviderCapabilityHandler = (
    input: Readonly<Record<string, unknown>>,
    context: ProviderCapabilityInvocationContext & {
        readonly http: ProviderHttpContext;
        readonly signal: AbortSignal;
    },
) => Promise<unknown>;

export interface ProviderCapabilityDispatcher {
    invoke(
        contractId: string,
        capabilityId: string,
        input: Readonly<Record<string, unknown>>,
        context: ProviderCapabilityInvocationContext,
    ): Promise<unknown>;
}

export interface ProviderCapabilityRegistry extends ProviderCapabilityDispatcher {
    register(contractId: string, capabilityId: string, handler: ProviderCapabilityHandler): void;
    seal(contracts: readonly ResolvedContract[]): void;
}

export class ProviderCapabilityDispatchError extends Error {
    /** Stable diagnostic identifier; never part of the capability response. */
    readonly reason?: string;

    constructor(
        readonly code: string,
        readonly status: number,
        message = code,
        readonly responseHeaders: Readonly<Record<string, string>> = {},
        readonly output?: unknown,
        reason?: string,
    ) {
        super(message);
        this.name = "ProviderCapabilityDispatchError";
        if (reason && reason.length <= 128 && /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u.test(reason)) {
            this.reason = reason;
        }
    }
}

/** Closed registry for the exact contract matrix mounted by one Provider. */
export class DefaultProviderCapabilityDispatcher implements ProviderCapabilityRegistry {
    readonly #handlers = new Map<string, ProviderCapabilityHandler>();
    #sealed = false;

    register(contractId: string, capabilityId: string, handler: ProviderCapabilityHandler): void {
        if (this.#sealed) {
            throw new Error("The Provider capability registry is already sealed.");
        }
        const key = capabilityKey(contractId, capabilityId);
        if (this.#handlers.has(key)) {
            throw new Error(`Provider capability is already registered: ${contractId}/${capabilityId}`);
        }
        this.#handlers.set(key, handler);
    }

    seal(contracts: readonly ResolvedContract[]): void {
        if (this.#sealed) {
            throw new Error("The Provider capability registry is already sealed.");
        }
        const declared = new Set(
            contracts.flatMap((contract) =>
                contract.capabilities.map(({ definition }) =>
                    capabilityKey(contract.release.contractId, definition.id),
                ),
            ),
        );
        const missing = [...declared].filter((key) => !this.#handlers.has(key));
        const unexpected = [...this.#handlers.keys()].filter((key) => !declared.has(key));
        if (missing.length || unexpected.length) {
            throw new Error(registryMismatch(missing, unexpected));
        }
        this.#sealed = true;
    }

    async invoke(
        contractId: string,
        capabilityId: string,
        input: Readonly<Record<string, unknown>>,
        context: ProviderCapabilityInvocationContext,
    ): Promise<unknown> {
        const handler = this.#handlers.get(capabilityKey(contractId, capabilityId));
        if (!handler) {
            throw new ProviderCapabilityDispatchError("CAPABILITY_NOT_FOUND", 404);
        }
        const live = hydrateProviderInvocationContext(context);
        return context.trace ? runWithTraceContext(context.trace, () => handler(input, live)) : handler(input, live);
    }
}

function capabilityKey(contractId: string, capabilityId: string): string {
    if (!contractId || !capabilityId) {
        throw new TypeError("Provider capability identity is required.");
    }
    return `${contractId}\0${capabilityId}`;
}

function registryMismatch(missing: readonly string[], unexpected: readonly string[]): string {
    const describe = (key: string) => key.replace("\0", "/");
    const details = [
        ...(missing.length ? [`missing: ${missing.map(describe).join(", ")}`] : []),
        ...(unexpected.length ? [`unexpected: ${unexpected.map(describe).join(", ")}`] : []),
    ];
    return `Provider capability registry does not match its contracts (${details.join("; ")}).`;
}

import type { GatewayRequestContext } from "cms-gateway/protocol/http/requestContext";

export {
    ProviderCapabilityResponse,
    capabilityResponse,
    ProviderResourceResponse,
    resourceResponse,
    type ProviderBinaryResult,
} from "./responses";
