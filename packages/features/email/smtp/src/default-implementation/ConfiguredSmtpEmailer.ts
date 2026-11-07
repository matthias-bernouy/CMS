import { configurationUpdate, storedConfiguration } from "email-smtp/core/configuration";
import type { StoredConfiguration } from "email-smtp/interfaces/SmtpEmailerConfiguration";
import type { SecretStore } from "@bernouy/secret-store";
import { EmailDeliveryDisabledError, type Emailer, type OutboundEmail } from "@bernouy/email";
import { SmtpEmailConfigurationError } from "email-smtp/core/SmtpEmailConfigurationError";
import { SmtpEmailer, type SmtpTransportFactory } from "./SmtpEmailer";
import type {
    SmtpEmailerAdministration,
    SmtpEmailerConfiguration,
    SmtpEmailerConfigurationUpdate,
} from "email-smtp/interfaces/SmtpEmailerConfiguration";

const CONFIGURATION_KEY = "SMTP_EMAILER_CONFIGURATION";
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
        const validated = configurationUpdate(input);
        const current = await this.read();
        const stored = storedConfiguration({
            ...validated,
            smtp: { ...validated.smtp, password: validated.smtp.password ?? current.smtp.password },
        });
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
            return storedConfiguration(JSON.parse(value));
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

function publicConfiguration(configuration: StoredConfiguration): SmtpEmailerConfiguration {
    const { password, ...smtp } = configuration.smtp;
    return { ...configuration, smtp: { ...smtp, passwordConfigured: Boolean(password) } };
}
