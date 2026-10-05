export interface OfficialCoreCapabilities {
    invoke(contractId: string, capabilityId: string, input: Readonly<Record<string, unknown>>): Promise<unknown>;
}
