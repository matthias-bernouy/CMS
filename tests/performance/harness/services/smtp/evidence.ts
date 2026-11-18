import type { Observation } from "../../clients/types";
import type { SmtpControl } from "./client";

/** Auxiliary reads are outside latency; retain the real attempt if its post-response counters fail. */
export async function observedSmtp(control: SmtpControl, recipient: string, send: () => Promise<Observation>) {
    const before = await control.counts(recipient);
    const result = await send();
    try {
        const after = await control.counts(recipient);
        return {
            ...result,
            dependencies: [
                {
                    service: "smtp" as const,
                    requests: after.requests - before.requests,
                    requestBytes: after.requestBytes - before.requestBytes,
                    responseBytes: after.responseBytes - before.responseBytes,
                    complete: after.requests > before.requests,
                },
            ],
        };
    } catch {
        return {
            ...result,
            validated: false,
            failure: "dependency-evidence-incomplete",
            dependencies: [
                { service: "smtp" as const, requests: 0, requestBytes: 0, responseBytes: 0, complete: false },
            ],
        };
    }
}
