import type { AuthEmailRecipient, Emailer, OutboundEmail } from "cms-auth/interfaces/Emailer";

export type SmtpEmailerConfig = {
    host: string;
    port: number;
    secure: boolean;
    username: string;
    password: string;
    fromEmail: string;
    fromName?: string;
    replyTo?: string;
    transportFactory?: SmtpTransportFactory;
};

export type SmtpTransportConfig = {
    host: string;
    port: number;
    secure: boolean;
    auth: {
        user: string;
        pass: string;
    };
};

export type SmtpSendMailInput = {
    from: string;
    to: string;
    subject: string;
    text: string;
    html?: string;
    replyTo?: string;
};

export type SmtpTransport = {
    sendMail(input: SmtpSendMailInput): Promise<unknown>;
};

export type SmtpTransportFactory = (config: SmtpTransportConfig) => SmtpTransport | Promise<SmtpTransport>;

export class SmtpEmailer implements Emailer {
    constructor(private readonly config: SmtpEmailerConfig) {}

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
            auth: {
                user: this.config.username,
                pass: this.config.password,
            },
        };
        if (this.config.transportFactory) {
            return this.config.transportFactory(transportConfig);
        }
        return createNodemailerTransport(transportConfig);
    }
}

async function createNodemailerTransport(config: SmtpTransportConfig): Promise<SmtpTransport> {
    const nodemailer = (await import("nodemailer")) as NodemailerModule;
    const createTransport = nodemailer.createTransport ?? nodemailer.default?.createTransport;
    if (!createTransport) {
        throw new Error("nodemailer.createTransport is not available.");
    }
    return createTransport(config) as SmtpTransport;
}

type NodemailerModule = {
    default?: {
        createTransport?: (config: SmtpTransportConfig) => SmtpTransport;
    };
    createTransport?: (config: SmtpTransportConfig) => SmtpTransport;
};

function formatMailbox(input: AuthEmailRecipient): string {
    const name = input.displayName?.trim();
    if (!name) {
        return input.email;
    }
    return `"${name.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}" <${input.email}>`;
}
