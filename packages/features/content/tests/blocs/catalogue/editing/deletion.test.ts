import { expect, test } from "bun:test";
import {
    InMemoryContentRepository,
    ValidatingContentRepository,
    createCmsSiteBloc,
    publishCmsSiteBloc,
    SiteBlocReferencedError,
} from "@bernouy/content";
import { siteBlocDefinition, siteBlocSnapshot } from "../../siteBlocFixture";

const make = async () => {
    const repository = new ValidatingContentRepository(new InMemoryContentRepository());
    await createCmsSiteBloc(repository, {
        tag: "site-target",
        name: "Target",
        group: "Site",
        content: "<p>Target</p>",
    });
    return { repository, identity: (await repository.getBlocRecord("site-target"))!.siteDefinition!.id };
};
test.each([false, true])("delete removes an unused local composition with publication=%s", async (published) => {
    const { repository, identity } = await make();
    if (published) {
        await publishCmsSiteBloc(repository, { tag: "site-target", revision: 1 });
    }
    await expect(repository.deleteSiteBloc("site-target", 2, identity)).rejects.toThrow();
    expect(await repository.getBlocRecord("site-target")).not.toBeNull();
    await repository.deleteSiteBloc("site-target", 1, identity);
    expect(await repository.getBlocRecord("site-target")).toBeNull();
});

test("draft Pages block deletion and blocker output is bounded", async () => {
    const { repository, identity } = await make();
    await publishCmsSiteBloc(repository, { tag: "site-target", revision: 1 });
    for (let index = 0; index < 20; index++) {
        await repository.insertPage(`/page-${index}`, "Consumer", '<div cms-bloc="site-target"></div>');
    }
    const before = await repository.getBlocRecord("site-target");
    try {
        await repository.deleteSiteBloc("site-target", 1, identity);
        throw new Error("Deletion must refuse");
    } catch (error) {
        expect(error).toBeInstanceOf(SiteBlocReferencedError);
        expect((error as SiteBlocReferencedError).references).toHaveLength(16);
        expect((error as SiteBlocReferencedError).truncated).toBe(true);
    }
    expect(await repository.getBlocRecord("site-target")).toEqual(before);
});

test("archived draft dependencies and inline code-managed markup block deletion", async () => {
    const { repository, identity } = await make();
    await repository.createSiteBloc(
        siteBlocDefinition({
            draft: siteBlocSnapshot({
                structure: [{ kind: "bloc", tag: "site-target", attributes: {}, children: [] }],
                slots: [],
                defaultContent: "",
            }),
        }),
    );
    await repository.archiveSiteBloc("site-feature-panel", 1);
    await expect(repository.deleteSiteBloc("site-target", 1, identity)).rejects.toMatchObject({
        references: [{ kind: "bloc", id: "site-feature-panel" }],
    });
    await repository.deleteSiteBloc("site-feature-panel", 1, "definition-1");
    await publishCmsSiteBloc(repository, { tag: "site-target", revision: 1 });
    await repository.createBloc({
        id: "code-consumer",
        kind: "composition",
        name: "Consumer",
        group: "Code",
        description: "",
        root: { accepts: ["div"] },
        viewJS: "",
        markupHTML: '<div cms-bloc="site-target"></div>',
    });
    await expect(repository.deleteSiteBloc("site-target", 1, identity)).rejects.toMatchObject({
        references: [{ kind: "bloc", id: "code-consumer" }],
    });
    await expect(repository.deleteSiteBloc("code-consumer", 1, "ignored")).rejects.toThrow("site-owned");
});
