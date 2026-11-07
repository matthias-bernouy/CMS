import type { FeatureErrorMapper } from "@bernouy/ulvia-sdk";
import { SmtpEmailConfigurationError } from "email-smtp/core/SmtpEmailConfigurationError";
export const mapSmtpError: FeatureErrorMapper = (cause, capability) => {
    if (capability.id === "smtp.configuration.update" && cause instanceof SmtpEmailConfigurationError) {
        return { code: "INVALID_INPUT", output: { message: "Email configuration is invalid." } };
    }
    return { code: "CORE_UNAVAILABLE", output: { message: "Email configuration is unavailable." } };
};
