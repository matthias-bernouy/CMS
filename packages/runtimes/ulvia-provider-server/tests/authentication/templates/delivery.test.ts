import { expect, test } from "bun:test";
import { InMemoryEmailer } from "@bernouy/email";
import { emailerFeature } from "@bernouy/email/feature";
import { executeCapability } from "@bernouy/ulvia-sdk/local";
import { selectedAccountEmailer } from "../../../src/runtime/authentication/templates/delivery";

test("the account delivery adapter uses the actual public Emailer input schema and preserves composed content", async () => {
    const sink = new InMemoryEmailer();
    const port = selectedAccountEmailer(
        async (contractId, capabilityId, input) => {
            expect(contractId).toBe("ulvia/cms.emailer");
            expect(capabilityId).toBe("emailer.send");
            expect(input).not.toHaveProperty("to");
            return executeCapability(emailerFeature, "emailer.send", {
                input,
                services: { emailer: sink },
                context: { providerId: "ulvia/primary-provider", siteId: "default" },
            });
        },
        async () => true,
    );
    const message = {
        to: { email: "visitor@example.com", displayName: "Visitor" },
        subject: "Composed",
        text: "Text",
        html: "<p>Text</p>",
    };
    await port.send(message);
    expect(sink.sent).toEqual([message]);
    await selectedAccountEmailer(
        async () => ({ sent: false }),
        async () => true,
    )
        .send(message)
        .then(
            () => {
                throw new Error("False acceptance must refuse");
            },
            () => {},
        );
});
