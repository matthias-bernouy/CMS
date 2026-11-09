export class ProviderInstanceRevisionConflictError extends Error {
    constructor(instanceId: string) {
        super(`Provider instance revision conflict: ${instanceId}`);
        this.name = "ProviderInstanceRevisionConflictError";
    }
}

export class ProviderInstanceTransitionBusyError extends Error {
    constructor(transitionId: string) {
        super(`Provider transition is already running: ${transitionId}`);
        this.name = "ProviderInstanceTransitionBusyError";
    }
}
