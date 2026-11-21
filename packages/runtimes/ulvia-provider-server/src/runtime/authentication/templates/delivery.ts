import type { Emailer } from "@bernouy/email";

/** Map the internal authored-message port to the selected public Emailer wire contract. */
export function selectedAccountEmailer(
    call: (contractId: string, capabilityId: string, input: unknown) => Promise<unknown>,
    isEnabled: () => Promise<boolean>,
): Emailer {
    return {
        isEnabled,
        send: async ({ to, ...content }) => {
            const output = await call("ulvia/cms.emailer", "emailer.send", {
                ...content,
                toEmail: to.email,
                ...(to.displayName === undefined ? {} : { toName: to.displayName }),
            });
            if (!output || typeof output !== "object" || !("sent" in output) || output.sent !== true) {
                throw new Error("The selected Emailer did not acknowledge acceptance");
            }
        },
    };
}
