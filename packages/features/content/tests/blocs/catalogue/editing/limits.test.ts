import { expect, test } from "bun:test";
import {
    createCmsSiteBloc,
    readCmsSiteBloc,
    readCmsSiteBlocIdentity,
    updateCmsSiteBloc,
    InMemoryContentRepository,
    ValidatingContentRepository,
} from "@bernouy/content";
import { siteBlocDefinition, siteBlocSnapshot } from "../../siteBlocFixture";
import type { SiteBlocNode } from "@bernouy/content";
import { editingRepositories, editingRepository } from "./repositories";

for (const [name, create] of editingRepositories) {
    for (const [boundary, content] of [
        ["64 levels", "<section>".repeat(62) + "<p>Text</p>" + "</section>".repeat(62)],
        ["16,384 nodes", "<p>Text</p>".repeat(8192)],
    ] as const) {
        test(`${name}: a composition created at ${boundary} remains readable, editable and deletable`, async () => {
            const { repository } = await editingRepository(create);
            await createCmsSiteBloc(repository, { tag: "site-boundary", name: "Boundary", group: "Site", content });
            const read = await readCmsSiteBloc(repository, { tag: "site-boundary" });
            expect(JSON.parse(read.draftJson).name).toBe("Boundary");
            await updateCmsSiteBloc(repository, {
                tag: read.tag,
                definitionId: read.definitionId,
                revision: read.draftRevision,
                draftJson: read.draftJson,
            });
            await repository.deleteSiteBloc(read.tag, 2, read.definitionId);
            expect(await repository.getBlocRecord(read.tag)).toBeNull();
        });
    }

    for (const [boundary, content] of [
        ["65 levels", "<section>".repeat(63) + "<p>Text</p>" + "</section>".repeat(63)],
        ["16,386 nodes", "<p>Text</p>".repeat(8193)],
    ] as const) {
        test(`${name}: creation refuses ${boundary} before persisting an unreadable composition`, async () => {
            const { repository } = await editingRepository(create);
            const before = (await repository.getBlocRecords()).map(({ tag }) => tag);
            const result = await createCmsSiteBloc(repository, {
                tag: "site-excessive",
                name: "Excessive",
                group: "Site",
                content,
            }).then(
                () => null,
                (error: unknown) => error,
            );
            expect((await repository.getBlocRecords()).map(({ tag }) => tag)).toEqual(before);
            expect(result).toBeInstanceOf(Error);
        });
    }
}

for (const [label, structure] of [
    [
        "65 levels",
        (() => {
            let node: SiteBlocNode = { kind: "text", value: "Old" };
            for (let index = 0; index < 65; index++) {
                node = { kind: "bloc", tag: "div", attributes: {}, children: [node] };
            }
            return [node];
        })(),
    ],
    ["16,385 nodes", Array.from({ length: 16385 }, () => ({ kind: "text" as const, value: "Old" }))],
] as const) {
    test(`an existing composition beyond ${label} can be read, reduced and saved`, async () => {
        const raw = new InMemoryContentRepository();
        await raw.createSiteBloc(siteBlocDefinition({ draft: siteBlocSnapshot({ structure: [...structure] }) }));
        const repository = new ValidatingContentRepository(raw);
        const read = await readCmsSiteBloc(repository, { tag: "site-feature-panel" });
        expect(JSON.parse(read.draftJson).structure).toHaveLength(structure.length);
        const draft = JSON.parse(read.draftJson);
        draft.structure = [{ kind: "text", value: "Reduced" }];
        draft.slots = [];
        await updateCmsSiteBloc(repository, {
            tag: read.tag,
            definitionId: read.definitionId,
            revision: 1,
            draftJson: JSON.stringify(draft),
        });
        expect((await readCmsSiteBloc(repository, { tag: read.tag })).draftRevision).toBe(2);
    });
}

test("an oversized existing composition still exposes the identity required for safe deletion", async () => {
    const raw = new InMemoryContentRepository();
    await raw.createSiteBloc(
        siteBlocDefinition({
            draft: siteBlocSnapshot({ structure: [{ kind: "text", value: "x".repeat(4 * 1024 * 1024) }] }),
        }),
    );
    const repository = new ValidatingContentRepository(raw);
    await expect(readCmsSiteBloc(repository, { tag: "site-feature-panel" })).rejects.toThrow();
    const identity = await readCmsSiteBlocIdentity(repository, { tag: "site-feature-panel" });
    expect(identity).not.toHaveProperty("draftJson");
    await repository.deleteSiteBloc(identity.tag, identity.draftRevision, identity.definitionId);
    expect(await repository.getBlocRecord(identity.tag)).toBeNull();
});
