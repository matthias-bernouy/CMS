import type { ContractRelease } from "@bernouy/cms-repository/contracts";

export type CoreCapabilityActorKind = "anonymous" | "user" | "administrator" | "provider" | "system";
export type CoreCapabilityOrigin = "delivery" | "page" | "control" | "provider" | "system" | "conformance";

/** Trusted transport metadata. It is never populated from authored capability input. */
export interface CoreCapabilityInvocationContext {
    readonly requestId: string;
    readonly siteId: string;
    readonly installationId: string;
    readonly origin: CoreCapabilityOrigin;
    readonly actorKind: CoreCapabilityActorKind;
    readonly providerSubjectId?: string;
    readonly idempotencyKey?: string;
}

export type CoreCapabilityHandler = (
    input: Readonly<Record<string, unknown>>,
    context: CoreCapabilityInvocationContext,
) => Promise<unknown>;

export interface CoreCapabilityDispatcher {
    invoke(
        contractId: string,
        capabilityId: string,
        input: Readonly<Record<string, unknown>>,
        context: CoreCapabilityInvocationContext,
    ): Promise<unknown>;
}

export interface CoreCapabilityRegistry extends CoreCapabilityDispatcher {
    register(contractId: string, capabilityId: string, handler: CoreCapabilityHandler): void;
    seal(contracts: readonly ContractRelease[]): void;
}

export class CoreCapabilityDispatchError extends Error {
    constructor(
        readonly code: string,
        readonly status: number,
        message = code,
    ) {
        super(message);
        this.name = "CoreCapabilityDispatchError";
    }
}

/** Closed registry for the exact contract matrix mounted by one CMS Core provider. */
export class DefaultCoreCapabilityDispatcher implements CoreCapabilityRegistry {
    readonly #handlers = new Map<string, CoreCapabilityHandler>();
    #sealed = false;

    register(contractId: string, capabilityId: string, handler: CoreCapabilityHandler): void {
        if (this.#sealed) {
            throw new Error("The CMS Core capability registry is already sealed.");
        }
        const key = capabilityKey(contractId, capabilityId);
        if (this.#handlers.has(key)) {
            throw new Error(`Core capability is already registered: ${contractId}/${capabilityId}`);
        }
        this.#handlers.set(key, handler);
    }

    seal(contracts: readonly ContractRelease[]): void {
        if (this.#sealed) {
            throw new Error("The CMS Core capability registry is already sealed.");
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
        context: CoreCapabilityInvocationContext,
    ): Promise<unknown> {
        const handler = this.#handlers.get(capabilityKey(contractId, capabilityId));
        if (!handler) {
            throw new CoreCapabilityDispatchError("CAPABILITY_NOT_FOUND", 404);
        }
        return handler(input, context);
    }
}

function capabilityKey(contractId: string, capabilityId: string): string {
    if (!contractId || !capabilityId) {
        throw new TypeError("Core capability identity is required.");
    }
    return `${contractId}\0${capabilityId}`;
}

function registryMismatch(missing: readonly string[], unexpected: readonly string[]): string {
    const describe = (key: string) => key.replace("\0", "/");
    const details = [
        ...(missing.length ? [`missing: ${missing.map(describe).join(", ")}`] : []),
        ...(unexpected.length ? [`unexpected: ${unexpected.map(describe).join(", ")}`] : []),
    ];
    return `CMS Core capability registry does not match its contracts (${details.join("; ")}).`;
}
