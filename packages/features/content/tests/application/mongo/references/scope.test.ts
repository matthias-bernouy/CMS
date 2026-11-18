import { expect, test } from "bun:test";
import { ContentValidationError } from "@bernouy/content";
import { referenceFixture } from "./fixture";

for (const [name, patch] of [
    ["title", { title: "Updated" }],
    ["description", { description: "Search description" }],
    ["SEO", { seo: { en: { title: "Search title" } } }],
    ["unpublication", { visible: false }],
] as const) {
    test(`Page ${name} changes preserve content without acquiring the composition reference fence`, async () => {
        const { db, first } = await referenceFixture();
        await first.insertPage("/page", "Page", '<div cms-bloc="site-target"></div>');
        let page = (await first.getPage("/page"))!;
        if (name === "unpublication") {
            await first.updatePage({ id: page.id, visible: true }, page.revision);
            page = (await first.getPage("/page"))!;
        }
        let lockReads = 0;
        db.get("site_bloc_publication_locks").afterFindOne = async () => {
            lockReads++;
        };
        await first.updatePage({ id: page.id, ...patch }, page.revision);
        expect(await first.getPage("/page")).toMatchObject({
            ...patch,
            content: page.content,
            revision: page.revision + 1,
        });
        expect(lockReads, "metadata-only updates must not serialize unrelated reference writers").toBe(0);
    });
}

for (const operation of ["archive", "restore"] as const) {
    test(`${operation} does not acquire the reference fence when it introduces no references`, async () => {
        const { db, first } = await referenceFixture();
        if (operation === "restore") {
            await first.archiveSiteBloc("site-target", 1);
        }
        const before = (await first.getBlocRecord("site-target"))!.siteDefinition!;
        let lockReads = 0;
        db.get("site_bloc_publication_locks").afterFindOne = async () => {
            lockReads++;
        };
        if (operation === "archive") {
            await first.archiveSiteBloc("site-target", 1);
        } else {
            await first.restoreSiteBloc("site-target", 1);
        }
        const after = (await first.getBlocRecord("site-target"))!.siteDefinition!;
        expect(after.lifecycle).toBe(operation === "archive" ? "archived" : "active");
        expect(after.draft).toEqual(before.draft);
        expect(after.published).toEqual(before.published);
        expect(lockReads).toBe(0);
    });
}

test("pure invalid-draft validation refuses before acquiring the cross-process reference fence", async () => {
    const { db, first } = await referenceFixture();
    const before = await first.getBlocRecord("site-target");
    let lockReads = 0;
    db.get("site_bloc_publication_locks").afterFindOne = async () => {
        lockReads++;
    };
    await expect(
        first.saveSiteBlocDraft("site-target", { ...before!.siteDefinition!.draft, name: "" }, 1),
    ).rejects.toBeInstanceOf(ContentValidationError);
    expect(await first.getBlocRecord("site-target")).toEqual(before);
    expect(lockReads).toBe(0);
});

test("rendering catalogue reads exclude reference indexes and editorial snapshots from storage", async () => {
    const { db, first } = await referenceFixture();
    db.get("blocs").loadedResults.length = 0;
    const result = await first.getBlocsList({ projection: "rendering" });
    expect(result.some(({ id }) => id === "site-target")).toBe(true);
    const loaded = db.get("blocs").loadedResults.at(-1)!;
    expect(loaded.length).toBeGreaterThan(0);
    for (const row of loaded) {
        expect(row).not.toHaveProperty("contentReferences");
        expect(row).not.toHaveProperty("siteDefinition.draft");
        expect(row).not.toHaveProperty("siteDefinition.published");
        expect(row).not.toHaveProperty("artifact.source");
    }
});
