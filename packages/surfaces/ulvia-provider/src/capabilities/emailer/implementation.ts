import { implementContract } from "@bernouy/ulvia-sdk";
import { isEmailDeliveryDisabledError } from "@bernouy/email";
import type { Emailer } from "@bernouy/email";
import { SmtpEmailConfigurationError } from "@bernouy/email-smtp";
import type { SmtpEmailerAdministration } from "@bernouy/email-smtp";
import { smtpEmailerContract } from "./contracts";
import { officialFailure } from "../../dispatch/errors/failure";
import { ProviderCapabilityDispatchError } from "../../dispatch/registry";

export type CmsSmtpEmailerDependencies = Readonly<{ emailer: Emailer & SmtpEmailerAdministration }>;

export const smtpEmailerImplementation = implementContract(
    smtpEmailerContract,
    {
        "smtp.configuration.get":
            ({ emailer }: CmsSmtpEmailerDependencies) =>
            () =>
                emailerCall(() => emailer.getConfiguration(), false),
        "smtp.configuration.update":
            ({ emailer }: CmsSmtpEmailerDependencies) =>
            (input) =>
                emailerCall(() =>
                    emailer.updateConfiguration({
                        ...input,
                        smtp: {
                            ...input.smtp,
                            ...(input.smtp.password === undefined
                                ? {}
                                : { password: text(input.smtp.password, "smtp.password") }),
                        },
                    }),
                ),
        "emailer.send":
            ({ emailer }: CmsSmtpEmailerDependencies) =>
            (input) =>
                emailerCall(async () => {
                    await emailer.send({
                        to: {
                            email: text(input.toEmail, "toEmail"),
                            ...(input.toName === undefined ? {} : { displayName: text(input.toName, "toName") }),
                        },
                        subject: text(input.subject, "subject"),
                        text: text(input.text, "text"),
                        ...(input.html === undefined ? {} : { html: text(input.html, "html") }),
                    });
                    return { sent: true };
                }),
    },
    {
        requires: [
            {
                contractId: "ulvia/cms.secrets",
                versionRange: "^1.0.0",
                capabilityId: "secrets.create",
                optional: false,
            },
            {
                contractId: "ulvia/cms.secrets",
                versionRange: "^1.0.0",
                capabilityId: "secrets.get-metadata-by-name",
                optional: false,
            },
            {
                contractId: "ulvia/cms.secrets",
                versionRange: "^1.0.0",
                capabilityId: "secrets.resolve",
                optional: false,
            },
            {
                contractId: "ulvia/cms.secrets",
                versionRange: "^1.0.0",
                capabilityId: "secrets.rotate",
                optional: false,
            },
        ],
    },
);

async function emailerCall<T>(operation: () => Promise<T>, acceptsInvalidInput = true): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        if (error instanceof ProviderCapabilityDispatchError) {
            throw error;
        }
        if (isEmailDeliveryDisabledError(error)) {
            throw officialFailure("EMAIL_DISABLED", 409, error);
        }
        if (acceptsInvalidInput && error instanceof SmtpEmailConfigurationError) {
            throw officialFailure("INVALID_INPUT", 422, error);
        }
        throw officialFailure("CORE_UNAVAILABLE", 503, error);
    }
}

function text(value: string, field: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
        throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422, `Invalid Emailer field: ${field}`);
    }
    return trimmed;
}
