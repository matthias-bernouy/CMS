import { expect, test } from "bun:test";
import { EmailTemplates } from "@bernouy/email-templates";
import { MemoryTemplateStore } from "@bernouy/email-templates/memory";
import {
    AccountEmailTemplates,
    MemoryAccountEmailConfigurationStore,
    accountTemplateSeeds,
} from "@bernouy/auth/email-templates";
import type { AccountTemplateClient } from "@bernouy/auth/email-templates";

async function fixture() {
    const templates = new EmailTemplates(new MemoryTemplateStore());
    const store = new MemoryAccountEmailConfigurationStore();
    let selected = "source-a";
    for (const seed of accountTemplateSeeds) {
        const created = await templates.create({
            id: seed.id,
            name: seed.name,
            description: "",
            locale: "en",
            draft: seed.draft,
        });
        await templates.publish({ id: seed.id, expectedRevision: created.revision });
    }
    const binding = (id: string) => ({ id, version: 1, source: selected });
    await store.initialize({
        revision: 1,
        emailVerification: binding(accountTemplateSeeds[0]!.id),
        passwordReset: binding(accountTemplateSeeds[1]!.id),
    });
    const client: AccountTemplateClient = {
        source: async () => selected,
        describe: async (binding) => ({
            archived: (await templates.get({ id: binding.id })).archived,
            content: (await templates.getVersion({ id: binding.id, version: binding.version })).content,
        }),
        render: (binding, values) => templates.render({ id: binding.id, version: binding.version, values }),
    };
    return {
        templates,
        store,
        composer: new AccountEmailTemplates(store, client),
        select: (source: string) => {
            selected = source;
        },
    };
}
const message = {
    kind: "email_verification" as const,
    to: { email: "visitor@example.com" },
    actionUrl: "https://site.test/confirm?token=secret",
    token: "raw-secret-never-forwarded",
    expiresAt: new Date("2026-11-22T12:00:00.000Z"),
    siteName: "My site",
};
test("Access renders its exact publication and preserves it across independent template edits and archive", async () => {
    const f = await fixture();
    const configuration = await f.composer.get();
    const first = await f.composer.compose(message);
    expect(first.text).toContain(message.actionUrl);
    expect(JSON.stringify(first)).not.toContain(message.token);
    await f.templates.archive({ id: configuration.emailVerification.id, expectedRevision: 2 });
    expect(await f.composer.compose(message)).toEqual(first);
    const before = await f.store.read();
    await expect(
        f.composer.update({
            expectedRevision: 1,
            emailVerification: configuration.emailVerification,
            passwordReset: configuration.emailVerification,
        }),
    ).rejects.toThrow("INVALID_INPUT");
    expect(await f.store.read()).toEqual(before);
});
test("changing selected source refuses delivery until explicit compatible reassociation", async () => {
    const f = await fixture();
    f.select("source-b");
    await expect(f.composer.compose(message)).rejects.toThrow("CORE_UNAVAILABLE");
    const configuration = await f.composer.get();
    expect(configuration.selectedSource).toBe("source-b");
    const update = {
        expectedRevision: 1,
        emailVerification: { ...configuration.emailVerification, source: "source-b" },
        passwordReset: { ...configuration.passwordReset, source: "source-b" },
    };
    await f.composer.update(update);
    await f.composer.update(update);
    expect((await f.composer.get()).revision).toBe(2);
    expect((await f.composer.compose(message)).text).toContain(message.actionUrl);
});
test("incompatible variable vocabulary refuses association without mutating account state", async () => {
    const f = await fixture();
    const bad = await f.templates.create({
        id: crypto.randomUUID(),
        name: "Billing",
        description: "",
        locale: "en",
        draft: { subject: "Bill", text: "{{invoice}}", variables: [{ name: "invoice", kind: "text", required: true }] },
    });
    await f.templates.publish({ id: bad.id, expectedRevision: 1 });
    const before = await f.store.read();
    await expect(
        f.composer.update({
            expectedRevision: 1,
            emailVerification: { id: bad.id, version: 1, source: "source-a" },
            passwordReset: before!.passwordReset,
        }),
    ).rejects.toThrow("INVALID_INPUT");
    expect(await f.store.read()).toEqual(before);
});
