export class EmailDeliveryDisabledError extends Error {
    constructor(message = "Email delivery is disabled.") {
        super(message);
        this.name = "EmailDeliveryDisabledError";
    }
}

export function isEmailDeliveryDisabledError(error: unknown): boolean {
    return error instanceof EmailDeliveryDisabledError;
}

/** Invalid delivery data or configuration supplied to an Emailer port. */
export class EmailDeliveryInputError extends Error {
    constructor(message = "Email delivery input is invalid.") {
        super(message);
        this.name = "EmailDeliveryInputError";
    }
}
