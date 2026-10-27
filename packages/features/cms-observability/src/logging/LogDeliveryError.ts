export class LogDeliveryError extends Error {
    constructor(readonly retryable: boolean) {
        super("Log delivery was rejected");
        this.name = "LogDeliveryError";
    }
}
