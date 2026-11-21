import { expect, test } from "bun:test";
import { EmailTemplates } from "@bernouy/email-templates";
import type { TemplateRecord } from "@bernouy/email-templates";
import { MemoryTemplateStore } from "@bernouy/email-templates/memory";

const draft = { subject: "Hello", text: "Original", variables: [] };
const input = () => ({ id: crypto.randomUUID(), name: "Template", description: "", locale: "en", draft });
test("more than 100 templates and 32 publications remain available without embedded histories", async () => {
    const store = new MemoryTemplateStore();
    const service = new EmailTemplates(store);
    const created = await service.create(input());
    for (let index = 0; index < 129; index++) {
        await service.create(input());
    }
    const first = await service.list({ limit: 100, includeArchived: true });
    const second = await service.list({ limit: 100, includeArchived: true, after: first.next });
    expect(first.items).toHaveLength(100);
    expect(second.items).toHaveLength(30);
    expect(second.next).toBeUndefined();
    await service.publish({ id: created.id, expectedRevision: 1 });
    await service.updateDraft({
        id: created.id,
        expectedRevision: 2,
        name: created.name,
        description: "",
        draft: { ...draft, text: "Updated" },
    });
    for (let version = 2; version <= 129; version++) {
        expect((await service.publish({ id: created.id, expectedRevision: version + 1 })).version).toBe(version);
    }
    expect((await service.getVersion({ id: created.id, version: 1 })).content.text).toBe("Original");
    expect((await service.getVersion({ id: created.id, version: 129 })).content.text).toBe("Updated");
    expect(await store.get(created.id)).not.toHaveProperty("publications");
});

test("the last safe version is usable and numeric exhaustion refuses before mutation", async () => {
    const store = new MemoryTemplateStore();
    const service = new EmailTemplates(store);
    const record: TemplateRecord = {
        ...input(),
        format: "ulvia-email-template/v1",
        revision: 1,
        latestVersion: Number.MAX_SAFE_INTEGER - 1,
        archived: false,
        lastMutation: "a".repeat(64),
    };
    await store.create(record);
    expect((await service.publish({ id: record.id, expectedRevision: 1 })).version).toBe(Number.MAX_SAFE_INTEGER);
    const before = await store.get(record.id);
    await expect(service.publish({ id: record.id, expectedRevision: 2 })).rejects.toThrow("COUNTER_EXHAUSTED");
    expect(await store.get(record.id)).toEqual(before);
    const exhausted = { ...record, id: crypto.randomUUID(), revision: Number.MAX_SAFE_INTEGER, latestVersion: 0 };
    await store.create(exhausted);
    await expect(service.archive({ id: exhausted.id, expectedRevision: Number.MAX_SAFE_INTEGER })).rejects.toThrow(
        "COUNTER_EXHAUSTED",
    );
    await expect(
        service.updateDraft({
            id: exhausted.id,
            expectedRevision: Number.MAX_SAFE_INTEGER,
            name: "Changed",
            description: "",
            draft,
        }),
    ).rejects.toThrow("COUNTER_EXHAUSTED");
    expect(await store.get(exhausted.id)).toEqual(exhausted);
});
