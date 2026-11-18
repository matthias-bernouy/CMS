import { expect, test } from "bun:test";
import {
    InMemoryContentRepository,
    ValidatingContentRepository,
    createCmsSiteBloc,
    readCmsSiteBloc,
    updateCmsSiteBloc,
} from "@bernouy/content";

test("malformed, excessive and ownership-changing snapshot documents refuse without writes", async () => {
    const repository = new ValidatingContentRepository(new InMemoryContentRepository());
    await createCmsSiteBloc(repository, {
        tag: "site-editable",
        name: "Editable",
        group: "Site",
        content: "<p>Before</p>",
    });
    const before = await repository.getBlocRecord("site-editable");
    const identity = before!.siteDefinition!.id;
    const valid = JSON.parse((await readCmsSiteBloc(repository, { tag: "site-editable" })).draftJson);
    let nested = { kind: "text", value: "End" } as unknown;
    for (let index = 0; index < 65; index++) {
        nested = { kind: "bloc", tag: "div", attributes: {}, children: [nested] };
    }
    const invalid = [
        "{",
        "null",
        "[]",
        JSON.stringify({ ...valid, ownership: { kind: "code-managed" } }),
        JSON.stringify({ ...valid, name: "x".repeat(121) }),
        JSON.stringify({ ...valid, structure: [nested] }),
        JSON.stringify({ ...valid, structure: Array.from({ length: 16385 }, () => ({ kind: "text", value: "a" })) }),
        JSON.stringify({ ...valid, description: "界".repeat(2 * 1024 * 1024) }),
    ];
    for (const draftJson of invalid) {
        await expect(
            updateCmsSiteBloc(repository, { tag: "site-editable", definitionId: identity, revision: 1, draftJson }),
        ).rejects.toThrow();
        expect(await repository.getBlocRecord("site-editable")).toEqual(before);
    }
});

test("archived drafts remain readable and require restoration before editing", async () => {
    const repository = new ValidatingContentRepository(new InMemoryContentRepository());
    await createCmsSiteBloc(repository, {
        tag: "site-archived",
        name: "Archived",
        group: "Site",
        content: "<p>Before</p>",
    });
    await repository.archiveSiteBloc("site-archived", 1);
    const read = await readCmsSiteBloc(repository, { tag: "site-archived" });
    expect(read.lifecycle).toBe("archived");
    await expect(
        updateCmsSiteBloc(repository, {
            tag: read.tag,
            definitionId: read.definitionId,
            revision: 1,
            draftJson: read.draftJson,
        }),
    ).rejects.toThrow();
    await repository.restoreSiteBloc(read.tag, 1);
    expect(
        (
            await updateCmsSiteBloc(repository, {
                tag: read.tag,
                definitionId: read.definitionId,
                revision: 1,
                draftJson: read.draftJson,
            })
        ).draftRevision,
    ).toBe(2);
});

test("an old identity cannot update or delete a replacement with the same tag and revision", async () => {
    const repository = new ValidatingContentRepository(new InMemoryContentRepository());
    const input = { tag: "site-reused", name: "First", group: "Site", content: "<p>First</p>" };
    await createCmsSiteBloc(repository, input);
    const old = await readCmsSiteBloc(repository, { tag: input.tag });
    await repository.deleteSiteBloc(old.tag, 1, old.definitionId);
    await createCmsSiteBloc(repository, { ...input, name: "Replacement", content: "<p>Replacement</p>" });
    const before = await repository.getBlocRecord(old.tag);
    expect(before!.siteDefinition!.id).not.toBe(old.definitionId);
    await expect(
        updateCmsSiteBloc(repository, {
            tag: old.tag,
            revision: 1,
            definitionId: old.definitionId,
            draftJson: old.draftJson,
        }),
    ).rejects.toThrow("identity");
    await expect(repository.deleteSiteBloc(old.tag, 1, old.definitionId)).rejects.toThrow("identity");
    expect(await repository.getBlocRecord(old.tag)).toEqual(before);
});
