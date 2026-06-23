import type { Emailer, OutboundEmail } from "cms-auth/interfaces/Emailer";

export class InMemoryEmailer implements Emailer {
    readonly sent: OutboundEmail[] = [];

    async send(input: OutboundEmail): Promise<void> {
        this.sent.push(clone(input));
    }

    clear(): void {
        this.sent.length = 0;
    }
}

function clone(input: OutboundEmail): OutboundEmail {
    return { ...input, to: { ...input.to } };
}
