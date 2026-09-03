export class ReleaseScenarioInfrastructureError extends Error {
    constructor(cause: unknown) {
        super("Release scenario infrastructure failed", { cause });
        this.name = "ReleaseScenarioInfrastructureError";
    }
}
