export class ControlProviderError extends Error {
    constructor(
        capabilityId: string,
        readonly status: number,
    ) {
        super(`Installations Provider rejected ${capabilityId} (${status})`);
        this.name = "ControlProviderError";
    }
}
