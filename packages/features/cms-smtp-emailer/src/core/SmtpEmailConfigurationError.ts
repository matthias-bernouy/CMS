export type SmtpEmailConfigurationErrorCode = "invalid_configuration";

export class SmtpEmailConfigurationError extends Error {
    constructor(
        message: string,
        readonly code: SmtpEmailConfigurationErrorCode = "invalid_configuration",
    ) {
        super(message);
        this.name = "SmtpEmailConfigurationError";
    }
}
