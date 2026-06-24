import type { SecretReader } from "@bernouy/cms-secrets";
import { secretRefToKey } from "@bernouy/cms-secrets";
import type { Emailer, OutboundEmail } from "cms-auth/interfaces/Emailer";
import { SmtpEmailer, type SmtpTransportFactory } from "cms-auth/default-implementation/SmtpEmailer";

export type RuntimeEmailSettings = {
    enabled:   boolean;
    fromEmail: string;
    fromName:  string;
    replyTo:   string;
    transport: "smtp";
    smtp: {
        host:              string;
        port:              number;
        secure:            boolean;
        username:          string;
        passwordSecretRef: string;
    };
};

export type ConfiguredEmailerConfig = {
    readSettings(): Promise<RuntimeEmailSettings>;
    secrets: SecretReader;
    transportFactory?: SmtpTransportFactory;
};

export class EmailConfigurationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "EmailConfigurationError";
    }
}

export class ConfiguredEmailer implements Emailer {
    constructor(private readonly config: ConfiguredEmailerConfig) {}

    async send(input: OutboundEmail): Promise<void> {
        const settings = await this.config.readSettings();
        if (!settings.enabled) {
            throw new EmailConfigurationError("Email delivery is disabled.");
        }
        if (settings.transport !== "smtp") {
            throw new EmailConfigurationError(`Unsupported email transport: ${settings.transport}.`);
        }

        const secretKey = secretRefToKey(settings.smtp.passwordSecretRef);
        if (!secretKey) {
            throw new EmailConfigurationError("SMTP password secret reference is invalid.");
        }
        const password = await this.config.secrets.get(secretKey);
        if (!password) {
            throw new EmailConfigurationError(`SMTP password secret "${secretKey}" was not found.`);
        }

        const emailer = new SmtpEmailer({
            host:             settings.smtp.host,
            port:             settings.smtp.port,
            secure:           settings.smtp.secure,
            username:         settings.smtp.username,
            password,
            fromEmail:        settings.fromEmail,
            fromName:         settings.fromName,
            replyTo:          settings.replyTo,
            transportFactory: this.config.transportFactory,
        });
        await emailer.send(input);
    }
}
