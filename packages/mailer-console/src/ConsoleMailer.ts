import type { MailMessage, Mailer } from "@bernouy/core";

/**
 * Default mailer used for development and tests.
 *
 * It does not actually send anything — it just prints the message to stdout.
 * Useful to inspect password reset links without configuring SMTP.
 */
export class DefaultConsoleMailer implements Mailer {

    private readonly defaultFrom: string;

    constructor(defaultFrom: string = "no-reply@localhost") {
        this.defaultFrom = defaultFrom;
    }

    async send(message: MailMessage): Promise<void> {
        const from = message.from ?? this.defaultFrom;
        console.log("───── ConsoleMailer ─────");
        console.log(`From:    ${from}`);
        console.log(`To:      ${message.to}`);
        console.log(`Subject: ${message.subject}`);
        if (message.text) {
            console.log("--- text ---");
            console.log(message.text);
        }
        console.log("--- html ---");
        console.log(message.html);
        console.log("─────────────────────────");
    }
}
