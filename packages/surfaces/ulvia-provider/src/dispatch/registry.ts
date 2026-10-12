import type { ContractRelease } from "@bernouy/cms-repository/contracts";

type ProviderCapabilityActorKind = "anonymous" | "user" | "administrator" | "provider" | "system";
type ProviderCapabilityOrigin = "page" | "provider" | "system" | "conformance";

/** Trusted transport metadata. It is never populated from authored capability input. */
export interface ProviderCapabilityInvocationContext {
    readonly requestId: string;
    readonly siteId: string;
    readonly installationId: string;
    readonly origin: ProviderCapabilityOrigin;
    readonly actorKind: ProviderCapabilityActorKind;
    readonly providerInstallationId?: string;
    readonly providerSubjectId?: string;
    readonly idempotencyKey?: string;
    readonly binaryBody?: {
        readonly stream: ReadableStream<Uint8Array>;
        readonly contentType?: string;
        readonly contentLength?: number;
    };
}

export interface ProviderBinaryResult {
    readonly kind: "binary";
    readonly stream: ReadableStream<Uint8Array>;
    readonly contentType: string;
    readonly status?: number;
    readonly contentLength?: number;
    readonly headers?: Readonly<Record<string, string>>;
}

export type ProviderCapabilityHandler = (
    input: Readonly<Record<string, unknown>>,
    context: ProviderCapabilityInvocationContext,
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
    seal(contracts: readonly ContractRelease[]): void;
}

export class ProviderCapabilityDispatchError extends Error {
    constructor(
        readonly code: string,
        readonly status: number,
        message = code,
        readonly responseHeaders: Readonly<Record<string, string>> = {},
    ) {
        super(message);
        this.name = "ProviderCapabilityDispatchError";
    }
}

/** Closed registry for the exact contract matrix mounted by one Ulvia Provider provider. */
export class DefaultProviderCapabilityDispatcher implements ProviderCapabilityRegistry {
    readonly #handlers = new Map<string, ProviderCapabilityHandler>();
    #sealed = false;

    register(contractId: string, capabilityId: string, handler: ProviderCapabilityHandler): void {
        if (this.#sealed) {
            throw new Error("The Ulvia Provider capability registry is already sealed.");
        }
        const key = capabilityKey(contractId, capabilityId);
        if (this.#handlers.has(key)) {
            throw new Error(`Provider capability is already registered: ${contractId}/${capabilityId}`);
        }
        this.#handlers.set(key, handler);
    }

    seal(contracts: readonly ContractRelease[]): void {
        if (this.#sealed) {
            throw new Error("The Ulvia Provider capability registry is already sealed.");
        }
        const declared = new Set(
            contracts.flatMap((contract) =>
                contract.capabilities.map((capability) => capabilityKey(contract.contractId, capability.id)),
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
        return handler(input, context);
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
    return `Ulvia Provider capability registry does not match its contracts (${details.join("; ")}).`;
}
