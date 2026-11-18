import { expect, test } from "bun:test";
import {
    InMemoryContentRepository,
    ValidatingContentRepository,
    readCmsSiteBloc,
    updateCmsSiteBloc,
    createCmsSiteBloc,
    publishCmsSiteBloc,
    BlocRevisionConflictError,
} from "@bernouy/content";
import { siteBlocDefinition, siteBlocSnapshot, siteBlocArtifact } from "../../siteBlocFixture";

test("detailed composition editing preserves recursive structure, slots, defaults and group membership", async () => {
    const raw = new InMemoryContentRepository();
    const repository = new ValidatingContentRepository(raw);
    const group = await repository.createSiteBlocGroup({ name: "Shared", description: "Site compositions" });
    await repository.createSiteBloc(siteBlocDefinition({ groupId: group.id }));
    const read = await readCmsSiteBloc(repository, { tag: "site-feature-panel" });
    const draft = JSON.parse(read.draftJson);
    draft.name = "Updated panel";
    draft.structure[0].attributes.title = 'A & B "quoted"';
    draft.structure[0].children.unshift({ kind: "text", value: "Shared text" });
    draft.dependencies = ["untrusted-input"];
    const updated = await updateCmsSiteBloc(repository, {
        definitionId: read.definitionId,
        tag: read.tag,
        revision: read.draftRevision,
        draftJson: JSON.stringify(draft),
    });
    const reread = await readCmsSiteBloc(repository, { tag: read.tag });
    expect(reread.groupId).toBe(group.id);
    expect(reread.definitionId).toBe(read.definitionId);
    const saved = JSON.parse(reread.draftJson);
    expect(saved.slots).toEqual(draft.slots);
    expect(saved.defaultContent).toBe(draft.defaultContent);
    expect(saved.structure).toEqual(draft.structure);
    expect(saved.dependencies).toEqual(["basic-section"]);
    expect(updated).toMatchObject({ name: "Updated panel", draftRevision: 2, publishedRevision: null });
    expect((await raw.getBlocRecord(read.tag))?.artifact).toBeNull();
    await expect(
        updateCmsSiteBloc(repository, {
            tag: read.tag,
            definitionId: read.definitionId,
            revision: 1,
            draftJson: reread.draftJson,
        }),
    ).rejects.toBeInstanceOf(BlocRevisionConflictError);
    expect((await readCmsSiteBloc(repository, { tag: read.tag })).draftJson).toBe(reread.draftJson);
});

test("saving a draft leaves the active publication unchanged until explicit publication", async () => {
    const repository = new ValidatingContentRepository(new InMemoryContentRepository());
    const created = await createCmsSiteBloc(repository, {
        tag: "site-shared",
        name: "Shared",
        group: "Site",
        content: "<section><p>Before</p></section>",
    });
    await publishCmsSiteBloc(repository, { tag: created.tag, revision: 1 });
    const before = await readCmsSiteBloc(repository, { tag: created.tag });
    const artifact = (await repository.getBlocRecord(created.tag))!.artifact;
    const draft = JSON.parse(before.draftJson);
    draft.structure[0].children[0].children[0].value = "After";
    const saved = await updateCmsSiteBloc(repository, {
        tag: created.tag,
        definitionId: before.definitionId,
        revision: 1,
        draftJson: JSON.stringify(draft),
    });
    expect(saved.draftRevision).toBe(2);
    expect((await readCmsSiteBloc(repository, { tag: created.tag })).publishedJson).toBe(before.publishedJson);
    expect((await repository.getBlocRecord(created.tag))!.artifact).toEqual(artifact);
    await publishCmsSiteBloc(repository, { tag: created.tag, revision: 2 });
    expect((await repository.getBlocRecord(created.tag))!.artifact?.markupHTML).toContain("After");
});

test("published slot identities cannot be removed by the editing API", async () => {
    const raw = new InMemoryContentRepository();
    await raw.createSiteBloc(siteBlocDefinition());
    await raw.publishSiteBloc("site-feature-panel", siteBlocArtifact(), 1);
    const repository = new ValidatingContentRepository(raw);
    const before = await raw.getBlocRecord("site-feature-panel");
    await expect(
        updateCmsSiteBloc(repository, {
            tag: "site-feature-panel",
            definitionId: "definition-1",
            revision: 1,
            draftJson: JSON.stringify(siteBlocSnapshot({ slots: [], structure: [] })),
        }),
    ).rejects.toThrow("slot");
    expect(await raw.getBlocRecord("site-feature-panel")).toEqual(before);
});
