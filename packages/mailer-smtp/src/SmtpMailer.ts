import type { MailMessage, Mailer } from "@bernouy/core";

export type SmtpMailerConfig = {
    host: string;
    port: number;
    secure?: boolean;
    auth?: {
        user: string;
        pass: string;
    };
    defaultFrom: string;
};

/**
 * SMTP-backed mailer built on top of nodemailer.
 *
 * Nodemailer is imported dynamically so that consumers who only use the
 * DefaultConsoleMailer don't pay the cost of pulling it in.
 */
export class DefaultSmtpMailer implements Mailer {

    private readonly config: SmtpMailerConfig;
    private _transporter: any | null = null;

    constructor(config: SmtpMailerConfig) {
        this.config = config;
    }

    private async transporter(): Promise<any> {
        if (this._transporter) return this._transporter;
        // nodemailer ships without types; we treat it as `any` on purpose so
        // that consumers aren't required to install @types/nodemailer.
        // @ts-ignore
        const nodemailer: any = await import("nodemailer");
        const createTransport = nodemailer.createTransport ?? nodemailer.default?.createTransport;
        if (!createTransport) {
            throw new Error("DefaultSmtpMailer: failed to load nodemailer.createTransport");
        }
        this._transporter = createTransport({
            host: this.config.host,
            port: this.config.port,
            secure: this.config.secure ?? false,
            auth: this.config.auth,
        });
        return this._transporter;
    }

    async send(message: MailMessage): Promise<void> {
        const t = await this.transporter();
        await t.sendMail({
            from: message.from ?? this.config.defaultFrom,
            to: message.to,
            subject: message.subject,
            html: message.html,
            text: message.text,
        });
    }
}
