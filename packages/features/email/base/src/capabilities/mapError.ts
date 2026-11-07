import type { FeatureErrorMapper } from "@bernouy/ulvia-sdk";
import { z } from "zod";
import { EmailDeliveryInputError, isEmailDeliveryDisabledError } from "email/core/EmailDeliveryError";
export const mapEmailError: FeatureErrorMapper = (cause) => {
    if (cause instanceof z.ZodError || cause instanceof EmailDeliveryInputError) {
        return { code: "INVALID_INPUT", output: { message: "Email data or configuration is invalid." } };
    }
    if (isEmailDeliveryDisabledError(cause)) {
        return { code: "EMAIL_DISABLED", output: { message: "Email delivery is disabled." } };
    }
    return { code: "CORE_UNAVAILABLE", output: { message: "Email delivery is unavailable." } };
};
