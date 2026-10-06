export interface OfficialCoreInvocationContext {
    readonly requestId: string;
    readonly siteId: string;
    readonly installationId: string;
    readonly origin: "delivery" | "page" | "control" | "provider" | "system" | "conformance";
    readonly actorKind: "anonymous" | "user" | "administrator" | "provider" | "system";
    readonly providerSubjectId?: string;
    readonly idempotencyKey?: string;
}

export interface OfficialCoreCapabilities {
    invoke(
        contractId: string,
        capabilityId: string,
        input: Readonly<Record<string, unknown>>,
        context: OfficialCoreInvocationContext,
    ): Promise<unknown>;
}

export class OfficialCoreCapabilityError extends Error {
    constructor(
        readonly code: string,
        readonly status: number,
    ) {
        super(`The selected Core rejected the capability with ${code}.`);
        this.name = "OfficialCoreCapabilityError";
    }
}
