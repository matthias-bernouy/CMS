import { EmailDeliveryInputError } from "@bernouy/email";
export type SmtpEmailConfigurationErrorCode = "invalid_configuration";

export class SmtpEmailConfigurationError extends EmailDeliveryInputError {
    constructor(
        message: string,
        readonly code: SmtpEmailConfigurationErrorCode = "invalid_configuration",
        readonly issue: Readonly<{ code: string; parameters?: Readonly<Record<string, string | number>> }> = {
            code: "smtp.invalid",
        },
    ) {
        super(message);
        this.name = "SmtpEmailConfigurationError";
    }
}
