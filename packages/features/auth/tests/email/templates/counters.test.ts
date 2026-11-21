import { expect, test } from "bun:test";
import { AccountEmailTemplates, MemoryAccountEmailConfigurationStore } from "@bernouy/auth/email-templates";

test("account associations accept safe large version numbers and refuse revision overflow without writing", async () => {
    const store = new MemoryAccountEmailConfigurationStore();
    const binding = { id: crypto.randomUUID(), version: Number.MAX_SAFE_INTEGER, source: "source" };
    await store.initialize({ revision: Number.MAX_SAFE_INTEGER, emailVerification: binding, passwordReset: binding });
    let calls = 0;
    const unused = async (): Promise<never> => {
        calls++;
        throw new Error("Unexpected template call");
    };
    const service = new AccountEmailTemplates(store, {
        source: async () => "source",
        describe: unused,
        render: unused,
    });
    const before = await store.read();
    expect((await service.get()).emailVerification.version).toBe(Number.MAX_SAFE_INTEGER);
    await expect(
        service.update({
            expectedRevision: Number.MAX_SAFE_INTEGER,
            emailVerification: binding,
            passwordReset: binding,
        }),
    ).rejects.toThrow("COUNTER_EXHAUSTED");
    expect(await store.read()).toEqual(before);
    expect(calls).toBe(0);
});
