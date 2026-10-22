import type { Emailer, OutboundEmail } from "cms-emailer/interfaces/Emailer";

export class InMemoryEmailer implements Emailer {
    readonly sent: OutboundEmail[] = [];

    async isEnabled(): Promise<boolean> {
        return true;
    }

    async send(input: OutboundEmail): Promise<void> {
        this.sent.push({ ...input, to: { ...input.to } });
    }

    clear(): void {
        this.sent.length = 0;
    }
}
