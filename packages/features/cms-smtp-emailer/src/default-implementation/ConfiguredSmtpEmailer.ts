import type { SecretStore } from "@bernouy/secret-store";
import { EmailDeliveryDisabledError, type Emailer, type OutboundEmail } from "@bernouy/cms-emailer";
import { SmtpEmailConfigurationError } from "cms-smtp-emailer/core/SmtpEmailConfigurationError";
import { SmtpEmailer, type SmtpTransportFactory } from "./SmtpEmailer";
import type {
    SmtpEmailerAdministration,
    SmtpEmailerConfiguration,
    SmtpEmailerConfigurationUpdate,
} from "cms-smtp-emailer/interfaces/SmtpEmailerConfiguration";

const CONFIGURATION_KEY = "SMTP_EMAILER_CONFIGURATION";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

type StoredConfiguration = Omit<SmtpEmailerConfiguration, "smtp"> & {
    smtp: Omit<SmtpEmailerConfiguration["smtp"], "passwordConfigured"> & { password: string };
};

export type ConfiguredSmtpEmailerConfig = Readonly<{
    secrets: SecretStore;
    transportFactory?: SmtpTransportFactory;
}>;

/** SMTP Emailer whose complete configuration is encrypted in its own secret namespace. */
export class ConfiguredSmtpEmailer implements Emailer, SmtpEmailerAdministration {
    constructor(private readonly config: ConfiguredSmtpEmailerConfig) {}

    async isEnabled(): Promise<boolean> {
        return (await this.read()).enabled;
    }

    async getConfiguration(): Promise<SmtpEmailerConfiguration> {
        return publicConfiguration(await this.read());
    }

    async updateConfiguration(input: SmtpEmailerConfigurationUpdate): Promise<SmtpEmailerConfiguration> {
        const current = await this.read();
        const stored = normalizeConfiguration(input, input.smtp.password ?? current.smtp.password);
        await this.config.secrets.set(CONFIGURATION_KEY, JSON.stringify(stored));
        return publicConfiguration(stored);
    }

    async send(input: OutboundEmail): Promise<void> {
        const configuration = await this.read();
        if (!configuration.enabled) {
            throw new EmailDeliveryDisabledError();
        }
        await new SmtpEmailer({
            host: configuration.smtp.host,
            port: configuration.smtp.port,
            secure: configuration.smtp.secure,
            username: configuration.smtp.username,
            password: configuration.smtp.password,
            fromEmail: configuration.fromEmail,
            fromName: configuration.fromName,
            replyTo: configuration.replyTo,
            transportFactory: this.config.transportFactory,
        }).send(input);
    }

    private async read(): Promise<StoredConfiguration> {
        const value = await this.config.secrets.get(CONFIGURATION_KEY);
        if (value === null) {
            return defaultConfiguration();
        }
        try {
            return parseStoredConfiguration(JSON.parse(value));
        } catch (error) {
            if (error instanceof SmtpEmailConfigurationError) {
                throw error;
            }
            throw new SmtpEmailConfigurationError("Stored email delivery configuration is invalid.");
        }
    }
}

function defaultConfiguration(): StoredConfiguration {
    return {
        enabled: false,
        fromEmail: "",
        fromName: "",
        replyTo: "",
        smtp: { host: "", port: 587, secure: false, username: "", password: "" },
    };
}

function parseStoredConfiguration(value: unknown): StoredConfiguration {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new SmtpEmailConfigurationError("Stored email delivery configuration is invalid.");
    }
    const record = value as Record<string, unknown>;
    const smtp = record.smtp;
    if (!smtp || typeof smtp !== "object" || Array.isArray(smtp)) {
        throw new SmtpEmailConfigurationError("Stored SMTP configuration is invalid.");
    }
    const smtpRecord = smtp as Record<string, unknown>;
    return normalizeConfiguration(
        {
            enabled: requiredBoolean(record.enabled),
            fromEmail: requiredString(record.fromEmail),
            fromName: requiredString(record.fromName),
            replyTo: requiredString(record.replyTo),
            smtp: {
                host: requiredString(smtpRecord.host),
                port: requiredPort(smtpRecord.port),
                secure: requiredBoolean(smtpRecord.secure),
                username: requiredString(smtpRecord.username),
                password: requiredString(smtpRecord.password),
            },
        },
        requiredString(smtpRecord.password),
    );
}

function normalizeConfiguration(input: SmtpEmailerConfigurationUpdate, password: string): StoredConfiguration {
    const configuration: StoredConfiguration = {
        enabled: requiredBoolean(input.enabled),
        fromEmail: requiredString(input.fromEmail).trim(),
        fromName: requiredString(input.fromName).trim(),
        replyTo: requiredString(input.replyTo).trim(),
        smtp: {
            host: requiredString(input.smtp.host).trim(),
            port: requiredPort(input.smtp.port),
            secure: requiredBoolean(input.smtp.secure),
            username: requiredString(input.smtp.username).trim(),
            password,
        },
    };
    if (configuration.enabled) {
        if (!EMAIL_PATTERN.test(configuration.fromEmail)) {
            throw new SmtpEmailConfigurationError("Enabled email delivery requires a valid sender address.");
        }
        if (configuration.replyTo && !EMAIL_PATTERN.test(configuration.replyTo)) {
            throw new SmtpEmailConfigurationError("Email reply-to address is invalid.");
        }
        if (!configuration.smtp.host || !configuration.smtp.username || !configuration.smtp.password) {
            throw new SmtpEmailConfigurationError("Enabled email delivery requires complete SMTP credentials.");
        }
    }
    return configuration;
}

function publicConfiguration(configuration: StoredConfiguration): SmtpEmailerConfiguration {
    const { password, ...smtp } = configuration.smtp;
    return { ...configuration, smtp: { ...smtp, passwordConfigured: Boolean(password) } };
}

function requiredString(value: unknown): string {
    if (typeof value !== "string") {
        throw new SmtpEmailConfigurationError("Email delivery configuration contains a non-string value.");
    }
    return value;
}

function requiredBoolean(value: unknown): boolean {
    if (typeof value !== "boolean") {
        throw new SmtpEmailConfigurationError("Email delivery configuration contains a non-boolean value.");
    }
    return value;
}

function requiredPort(value: unknown): number {
    if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 65_535) {
        throw new SmtpEmailConfigurationError("SMTP port must be an integer between 1 and 65535.");
    }
    return Number(value);
}
