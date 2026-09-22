export type EmailConfigurationErrorCode =
    | "disabled"
    | "invalid_configuration"
    | "unsupported_transport"
    | "invalid_secret_reference"
    | "missing_secret";

export class EmailConfigurationError extends Error {
    constructor(
        message: string,
        readonly code: EmailConfigurationErrorCode = "invalid_configuration",
    ) {
        super(message);
        this.name = "EmailConfigurationError";
    }
}

export function isEmailDeliveryDisabledError(error: unknown): boolean {
    return error instanceof EmailConfigurationError && error.code === "disabled";
}
