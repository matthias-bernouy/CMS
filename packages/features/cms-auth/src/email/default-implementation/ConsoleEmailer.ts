import type { Emailer, OutboundEmail } from "cms-auth/email/interfaces/Emailer";

export class ConsoleEmailer implements Emailer {
    constructor(private readonly output: (message: string) => void) {}

    async send(input: OutboundEmail): Promise<void> {
        this.output(`[cms-auth] ${input.subject} for ${input.to.email}`);
        this.output(input.text);
    }
}
