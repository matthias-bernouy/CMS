import { expect, test } from "bun:test";
import { InMemoryEmailer } from "@bernouy/cms-emailer";

test("the in-memory Emailer snapshots deliveries and can be cleared", async () => {
    const emailer = new InMemoryEmailer();
    const message = {
        to: { email: "person@example.com", displayName: "Person" },
        subject: "Welcome",
        text: "Welcome aboard.",
    };

    expect(await emailer.isEnabled()).toBeTrue();
    await emailer.send(message);
    message.to.displayName = "Changed later";
    expect(emailer.sent).toEqual([
        {
            to: { email: "person@example.com", displayName: "Person" },
            subject: "Welcome",
            text: "Welcome aboard.",
        },
    ]);

    emailer.clear();
    expect(emailer.sent).toEqual([]);
});
