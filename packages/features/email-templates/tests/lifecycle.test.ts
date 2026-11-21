import { expect, test } from "bun:test";
import { EmailTemplates } from "@bernouy/email-templates";
import { MemoryTemplateStore } from "@bernouy/email-templates/memory";

const draft = { subject: "Hello", text: "Version one", variables: [] };
const fixture = () => new EmailTemplates(new MemoryTemplateStore());
const input = () => ({ id: crypto.randomUUID(), name: "Default", description: "", locale: "en", draft });
test("publication remains immutable across draft edits, archive and independent consumer references", async () => {
    const service = fixture();
    const created = await service.create(input());
    const v1 = await service.publish({ id: created.id, expectedRevision: created.revision });
    const changed = await service.updateDraft({
        id: created.id,
        name: created.name,
        description: created.description,
        expectedRevision: 2,
        draft: { ...draft, text: "Version two" },
    });
    const v2 = await service.publish({ id: created.id, expectedRevision: changed.revision });
    expect(await service.render({ id: created.id, version: v1.version, values: [] })).toEqual({
        subject: "Hello",
        text: "Version one",
    });
    expect(await service.render({ id: created.id, version: v2.version, values: [] })).toEqual({
        subject: "Hello",
        text: "Version two",
    });
    await service.archive({ id: created.id, expectedRevision: 4 });
    expect(await service.getVersion({ id: v1.id, version: v1.version })).toEqual({ ...v1, archived: true });
    await expect(service.publish({ id: created.id, expectedRevision: 5 })).rejects.toThrow("ARCHIVED");
});
test("CAS replay converges; stale changes and duplicate identity changes do not overwrite", async () => {
    const service = fixture();
    const request = input();
    const created = await service.create(request);
    expect(await service.create(request)).toEqual(created);
    const publish = { id: created.id, expectedRevision: 1 };
    expect(await service.publish(publish)).toEqual(await service.publish(publish));
    await expect(service.create({ ...request, name: "Overwrite" })).rejects.toThrow("REVISION_CONFLICT");
    await expect(
        service.updateDraft({
            id: request.id,
            name: request.name,
            description: request.description,
            draft: request.draft,
            expectedRevision: 1,
        }),
    ).rejects.toThrow("REVISION_CONFLICT");
    expect((await service.get({ id: created.id })).name).toBe("Default");
});
test("instance stores isolate identities and pagination contains summaries only", async () => {
    const a = fixture();
    const b = fixture();
    for (let index = 0; index < 4; index++) {
        await a.create(input());
    }
    const first = await a.list({ limit: 2, includeArchived: false });
    const second = await a.list({ limit: 2, includeArchived: false, after: first.next });
    expect(first.items).toHaveLength(2);
    expect(second.items).toHaveLength(2);
    expect(second.next).toBeUndefined();
    expect(first.items[0]).not.toHaveProperty("draft");
    await expect(b.get({ id: first.items[0]!.id })).rejects.toThrow("NOT_FOUND");
});

test("HTML normalization cannot persist content larger than the admitted source bounds", async () => {
    const service = fixture();
    await expect(service.create({ ...input(), draft: { ...draft, html: "&".repeat(10000) } })).rejects.toThrow(
        "INVALID_INPUT",
    );
    expect((await service.list({ limit: 100, includeArchived: true })).items).toHaveLength(0);
    const created = await service.create(input());
    await expect(
        service.updateDraft({
            id: created.id,
            name: created.name,
            description: created.description,
            expectedRevision: created.revision,
            draft: { ...draft, html: "&".repeat(10000) },
        }),
    ).rejects.toThrow("INVALID_INPUT");
    expect(await service.get({ id: created.id })).toEqual(created);
});
