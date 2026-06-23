import type { Emailer, OutboundEmail } from "cms-auth/interfaces/Emailer";

type Logger = Pick<Console, "log">;

export class ConsoleEmailer implements Emailer {
    constructor(private readonly logger: Logger = console) {}

    async send(input: OutboundEmail): Promise<void> {
        this.logger.log(`[cms-auth] ${input.subject} for ${input.to.email}`);
        this.logger.log(input.text);
    }
}
