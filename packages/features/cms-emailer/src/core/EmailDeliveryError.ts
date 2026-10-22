export class EmailDeliveryDisabledError extends Error {
    constructor(message = "Email delivery is disabled.") {
        super(message);
        this.name = "EmailDeliveryDisabledError";
    }
}

export function isEmailDeliveryDisabledError(error: unknown): boolean {
    return error instanceof EmailDeliveryDisabledError;
}
