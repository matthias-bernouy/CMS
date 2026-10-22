import type { Emailer, OutboundEmail } from "cms-emailer/interfaces/Emailer";

export class ConsoleEmailer implements Emailer {
    constructor(private readonly output: (message: string) => void) {}

    async isEnabled(): Promise<boolean> {
        return true;
    }

    async send(input: OutboundEmail): Promise<void> {
        this.output(`[cms-emailer] ${input.subject} for ${input.to.email}`);
        this.output(input.text);
    }
}
