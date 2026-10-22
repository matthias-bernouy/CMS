import type { EmailRecipient, Emailer, OutboundEmail } from "@bernouy/cms-emailer";
import { createTransport } from "nodemailer";

export type SmtpEmailerConfig = Readonly<{
    host: string;
    port: number;
    secure: boolean;
    username: string;
    password: string;
    fromEmail: string;
    fromName?: string;
    replyTo?: string;
    transportFactory?: SmtpTransportFactory;
}>;

export type SmtpTransportConfig = Readonly<{
    host: string;
    port: number;
    secure: boolean;
    auth: Readonly<{ user: string; pass: string }>;
}>;

export type SmtpSendMailInput = Readonly<{
    from: string;
    to: string;
    subject: string;
    text: string;
    html?: string;
    replyTo?: string;
}>;

export type SmtpTransport = {
    sendMail(input: SmtpSendMailInput): Promise<unknown>;
};

export type SmtpTransportFactory = (config: SmtpTransportConfig) => SmtpTransport | Promise<SmtpTransport>;

export class SmtpEmailer implements Emailer {
    constructor(private readonly config: SmtpEmailerConfig) {}

    async isEnabled(): Promise<boolean> {
        return true;
    }

    async send(input: OutboundEmail): Promise<void> {
        const transport = await this.createTransport();
        await transport.sendMail({
            from: formatMailbox({ email: this.config.fromEmail, displayName: this.config.fromName }),
            to: formatMailbox(input.to),
            subject: input.subject,
            text: input.text,
            html: input.html,
            replyTo: this.config.replyTo || undefined,
        });
    }

    private async createTransport(): Promise<SmtpTransport> {
        const transportConfig: SmtpTransportConfig = {
            host: this.config.host,
            port: this.config.port,
            secure: this.config.secure,
            auth: { user: this.config.username, pass: this.config.password },
        };
        return this.config.transportFactory
            ? this.config.transportFactory(transportConfig)
            : createTransport(transportConfig);
    }
}

function formatMailbox(input: EmailRecipient): string {
    const name = input.displayName?.trim();
    if (!name) {
        return input.email;
    }
    return `"${name.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}" <${input.email}>`;
}
