import type { Emailer, OutboundEmail } from "email/interfaces/Emailer";

export class ConsoleEmailer implements Emailer {
    constructor(private readonly output: (message: string) => void) {}

    async isEnabled(): Promise<boolean> {
        return true;
    }

    async send(input: OutboundEmail): Promise<void> {
        this.output(`[email] ${input.subject} for ${input.to.email}`);
        this.output(input.text);
    }
}
