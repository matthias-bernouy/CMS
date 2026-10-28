import { expect, test } from "bun:test";
import { prepareDispatch } from "cms-gateway/invocation/core/dispatch/prepareDispatch";

test("dispatch prepares identity and delegation concurrently and closes a partial root before propagating failure", async () => {
    for (const failIdentity of [false, true]) {
        const subject = Promise.withResolvers<string>();
        const root = Promise.withResolvers<{ ticket: string; expiresAt: number }>();
        const events: string[] = [];
        const pending = prepareDispatch(
            () => {
                events.push("identity");
                return subject.promise;
            },
            () => {
                events.push("delegation");
                return root.promise;
            },
            async () => {
                events.push("closed");
            },
        );
        const outcome = pending.then(
            (value) => ({ value }),
            (error) => ({ error }),
        );
        await Promise.resolve();
        expect(events).toEqual(["identity", "delegation"]);
        root.resolve({ ticket: "ticket", expiresAt: Date.now() + 1000 });
        if (failIdentity) {
            subject.reject(new Error("identity revoked"));
        } else {
            subject.resolve("alias");
        }
        const result = await outcome;
        if ("error" in result) {
            expect(result.error.message).toBe("identity revoked");
            expect(events.at(-1)).toBe("closed");
        } else {
            expect(result.value.subjectId).toBe("alias");
            expect(events).not.toContain("closed");
        }
    }
});
