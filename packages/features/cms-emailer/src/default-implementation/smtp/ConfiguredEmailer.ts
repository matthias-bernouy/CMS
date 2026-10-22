import type { SecretStore } from "@bernouy/secret-store";
import { EmailConfigurationError } from "cms-emailer/core/EmailConfigurationError";
import { SmtpEmailer, type SmtpTransportFactory } from "cms-emailer/default-implementation/smtp/SmtpEmailer";
import type { Emailer, OutboundEmail } from "cms-emailer/interfaces/Emailer";
import type {
    EmailerAdministration,
    EmailerConfiguration,
    EmailerConfigurationUpdate,
} from "cms-emailer/interfaces/EmailerConfiguration";

const CONFIGURATION_KEY = "EMAILER_CONFIGURATION";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

type StoredConfiguration = Omit<EmailerConfiguration, "smtp"> & {
    smtp: Omit<EmailerConfiguration["smtp"], "passwordConfigured"> & { password: string };
};

export type ConfiguredEmailerConfig = Readonly<{
    secrets: SecretStore;
    transportFactory?: SmtpTransportFactory;
}>;

/** SMTP-backed Emailer whose complete configuration is encrypted in its own secret namespace. */
export class ConfiguredEmailer implements Emailer, EmailerAdministration {
    constructor(private readonly config: ConfiguredEmailerConfig) {}

    async isEnabled(): Promise<boolean> {
        return (await this.read()).enabled;
    }

    async getConfiguration(): Promise<EmailerConfiguration> {
        return publicConfiguration(await this.read());
    }

    async updateConfiguration(input: EmailerConfigurationUpdate): Promise<EmailerConfiguration> {
        const current = await this.read();
        const stored = normalizeConfiguration(input, input.smtp.password ?? current.smtp.password);
        await this.config.secrets.set(CONFIGURATION_KEY, JSON.stringify(stored));
        return publicConfiguration(stored);
    }

    async send(input: OutboundEmail): Promise<void> {
        const configuration = await this.read();
        if (!configuration.enabled) {
            throw new EmailConfigurationError("Email delivery is disabled.", "disabled");
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
            if (error instanceof EmailConfigurationError) {
                throw error;
            }
            throw new EmailConfigurationError("Stored email delivery configuration is invalid.");
        }
    }
}

function defaultConfiguration(): StoredConfiguration {
    return {
        enabled: false,
        fromEmail: "",
        fromName: "",
        replyTo: "",
        transport: "smtp",
        smtp: { host: "", port: 587, secure: false, username: "", password: "" },
    };
}

function parseStoredConfiguration(value: unknown): StoredConfiguration {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new EmailConfigurationError("Stored email delivery configuration is invalid.");
    }
    const record = value as Record<string, unknown>;
    const smtp = record.smtp;
    if (!smtp || typeof smtp !== "object" || Array.isArray(smtp)) {
        throw new EmailConfigurationError("Stored SMTP configuration is invalid.");
    }
    const smtpRecord = smtp as Record<string, unknown>;
    return normalizeConfiguration(
        {
            enabled: requiredBoolean(record.enabled),
            fromEmail: requiredString(record.fromEmail),
            fromName: requiredString(record.fromName),
            replyTo: requiredString(record.replyTo),
            transport: record.transport === "smtp" ? "smtp" : invalidTransport(),
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

function normalizeConfiguration(input: EmailerConfigurationUpdate, password: string): StoredConfiguration {
    const configuration: StoredConfiguration = {
        enabled: requiredBoolean(input.enabled),
        fromEmail: requiredString(input.fromEmail).trim(),
        fromName: requiredString(input.fromName).trim(),
        replyTo: requiredString(input.replyTo).trim(),
        transport: input.transport === "smtp" ? "smtp" : invalidTransport(),
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
            throw new EmailConfigurationError("Enabled email delivery requires a valid sender address.");
        }
        if (configuration.replyTo && !EMAIL_PATTERN.test(configuration.replyTo)) {
            throw new EmailConfigurationError("Email reply-to address is invalid.");
        }
        if (!configuration.smtp.host || !configuration.smtp.username || !configuration.smtp.password) {
            throw new EmailConfigurationError("Enabled email delivery requires complete SMTP credentials.");
        }
    }
    return configuration;
}

function publicConfiguration(configuration: StoredConfiguration): EmailerConfiguration {
    const { password, ...smtp } = configuration.smtp;
    return { ...configuration, smtp: { ...smtp, passwordConfigured: Boolean(password) } };
}

function requiredString(value: unknown): string {
    if (typeof value !== "string") {
        throw new EmailConfigurationError("Email delivery configuration contains a non-string value.");
    }
    return value;
}

function requiredBoolean(value: unknown): boolean {
    if (typeof value !== "boolean") {
        throw new EmailConfigurationError("Email delivery configuration contains a non-boolean value.");
    }
    return value;
}

function requiredPort(value: unknown): number {
    if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 65_535) {
        throw new EmailConfigurationError("SMTP port must be an integer between 1 and 65535.");
    }
    return Number(value);
}

function invalidTransport(): never {
    throw new EmailConfigurationError("Unsupported email delivery transport.");
}
