export interface OfficialCoreCapabilities {
    invoke(contractId: string, capabilityId: string, input: Readonly<Record<string, unknown>>): Promise<unknown>;
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
