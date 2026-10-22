import {
    EmailConfigurationError,
    type EmailerAdministration,
    type EmailerConfigurationUpdate,
    type Emailer,
} from "@bernouy/cms-emailer";
import { ProviderCapabilityDispatchError, type ProviderCapabilityRegistry } from "../dispatch/registry";

export type CmsEmailerDependencies = Readonly<{
    emailer: Emailer & EmailerAdministration;
}>;

export function registerEmailerCapabilities(
    dispatcher: ProviderCapabilityRegistry,
    dependencies: CmsEmailerDependencies,
): void {
    dispatcher.register("ulvia.cms.emailer", "emailer.configuration.get", () =>
        emailerCall(() => dependencies.emailer.getConfiguration()),
    );
    dispatcher.register("ulvia.cms.emailer", "emailer.configuration.update", (input) =>
        emailerCall(() => dependencies.emailer.updateConfiguration(configuration(input))),
    );
    dispatcher.register("ulvia.cms.emailer", "emailer.send", (input) =>
        emailerCall(async () => {
            await dependencies.emailer.send({
                to: {
                    email: text(input.toEmail, "toEmail"),
                    ...(optionalText(input.toName, "toName")
                        ? { displayName: optionalText(input.toName, "toName") }
                        : {}),
                },
                subject: text(input.subject, "subject"),
                text: text(input.text, "text"),
                ...(optionalText(input.html, "html") ? { html: optionalText(input.html, "html") } : {}),
            });
            return { sent: true };
        }),
    );
}

function configuration(input: Readonly<Record<string, unknown>>): EmailerConfigurationUpdate {
    const smtp = object(input.smtp, "smtp");
    return {
        enabled: boolean(input.enabled, "enabled"),
        fromEmail: string(input.fromEmail, "fromEmail"),
        fromName: string(input.fromName, "fromName"),
        replyTo: string(input.replyTo, "replyTo"),
        transport: input.transport === "smtp" ? "smtp" : invalid("transport"),
        smtp: {
            host: string(smtp.host, "smtp.host"),
            port: integer(smtp.port, "smtp.port"),
            secure: boolean(smtp.secure, "smtp.secure"),
            username: string(smtp.username, "smtp.username"),
            ...(smtp.password === undefined ? {} : { password: text(smtp.password, "smtp.password") }),
        },
    };
}

async function emailerCall<T>(operation: () => Promise<T>): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        if (error instanceof ProviderCapabilityDispatchError) {
            throw error;
        }
        if (error instanceof EmailConfigurationError) {
            throw new ProviderCapabilityDispatchError(
                error.code === "disabled" ? "EMAIL_DISABLED" : "INVALID_INPUT",
                error.code === "disabled" ? 409 : 422,
            );
        }
        throw new ProviderCapabilityDispatchError("CORE_UNAVAILABLE", 503);
    }
}

function object(value: unknown, field: string): Readonly<Record<string, unknown>> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return invalid(field);
    }
    return value as Readonly<Record<string, unknown>>;
}

function string(value: unknown, field: string): string {
    if (typeof value !== "string") {
        return invalid(field);
    }
    return value;
}

function text(value: unknown, field: string): string {
    const valueString = string(value, field).trim();
    return valueString ? valueString : invalid(field);
}

function optionalText(value: unknown, field: string): string | undefined {
    return value === undefined ? undefined : text(value, field);
}

function boolean(value: unknown, field: string): boolean {
    if (typeof value !== "boolean") {
        return invalid(field);
    }
    return value;
}

function integer(value: unknown, field: string): number {
    if (!Number.isSafeInteger(value)) {
        return invalid(field);
    }
    return Number(value);
}

function invalid(field: string): never {
    throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422, `Invalid Emailer field: ${field}`);
}
