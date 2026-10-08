import { expect, test } from "bun:test";
import { CollectionStore, MemoryCollectionStorage } from "@bernouy/cms-repository/collections/installations";
import { InMemoryCmsRepository, ValidatingCmsRepository, withInstalledCollections } from "@bernouy/cms-content";
import { CollectionMigrationService, MemoryCollectionMigrationStorage } from "@bernouy/cms-content/migrations";

test("rejects rollback when a page created later needs a target-only bloc", async () => {
    const fixture = await rollbackFixture();
    const completed = await fixture.service.execute("site", [{ digest: fixture.next.digest }], 1);
    await fixture.repository.insertPage("/new", "New", "<atlas-panel></atlas-panel>");

    await expect(fixture.service.rollback("site", completed.id)).rejects.toMatchObject({ status: 409 });
    expect((await fixture.collections.snapshot("site")).collections[0]!.digest).toBe(fixture.next.digest);
    expect(await fixture.storage.getActive("site")).toBeNull();
    expect(await fixture.storage.get(completed.id)).toMatchObject({ status: "completed" });
});

test("rejects rollback when a later page needs a target-only theme token or text", async () => {
    const fixture = await rollbackFixture();
    const completed = await fixture.service.execute("site", [{ digest: fixture.next.digest }], 1);
    await fixture.repository.createBloc(stableShell());
    await fixture.repository.insertPage(
        "/new",
        "New",
        '<stable-shell><p slot="content">var(--atlas-brand) {{ cms.i18n.atlas.new-title }}</p></stable-shell>',
    );

    await expect(fixture.service.rollback("site", completed.id)).rejects.toThrow("Rollback would invalidate page");
    expect((await fixture.collections.snapshot("site")).collections[0]!.digest).toBe(fixture.next.digest);
});

test("rejects rollback when a later page needs only a target collection text", async () => {
    const fixture = await rollbackFixture();
    const completed = await fixture.service.execute("site", [{ digest: fixture.next.digest }], 1);
    await fixture.repository.createBloc(stableShell());
    await fixture.repository.insertPage(
        "/new",
        "New",
        '<stable-shell><p slot="content">{{ cms.i18n.atlas.new-title }}</p></stable-shell>',
    );

    await expect(fixture.service.rollback("site", completed.id)).rejects.toThrow(
        "references collection text atlas.new-title",
    );
    expect((await fixture.collections.snapshot("site")).collections[0]!.digest).toBe(fixture.next.digest);
});

test("keeps compatible pages created after migration when rollback succeeds", async () => {
    const fixture = await rollbackFixture();
    const completed = await fixture.service.execute("site", [{ digest: fixture.next.digest }], 1);
    await fixture.repository.insertPage("/new", "New", "");

    const rolledBack = await fixture.service.rollback("site", completed.id);
    expect(rolledBack.status).toBe("rolled-back");
    expect(await fixture.repository.getPage("/new")).toMatchObject({
        content: "",
    });
    expect((await fixture.collections.snapshot("site")).collections[0]!.digest).not.toBe(fixture.next.digest);
});

test("preserves page metadata changes while restoring only migrated content", async () => {
    const fixture = await rollbackFixture();
    const completed = await fixture.service.execute("site", [{ digest: fixture.next.digest }], 1);
    const page = (await fixture.repository.getPage("/existing"))!;
    await fixture.repository.updatePage({ id: page.id, title: "Renamed after migration" }, page.revision);

    await fixture.service.rollback("site", completed.id);
    expect(await fixture.repository.getPage("/existing")).toMatchObject({
        title: "Renamed after migration",
        content: "<atlas-card></atlas-card>",
    });
});

test("keeps a deliberately deleted migrated page deleted on rollback", async () => {
    const fixture = await rollbackFixture();
    const completed = await fixture.service.execute("site", [{ digest: fixture.next.digest }], 1);
    const page = (await fixture.repository.getPage("/existing"))!;
    await fixture.repository.deletePage(page.id, page.revision);

    const rolledBack = await fixture.service.rollback("site", completed.id);
    expect(rolledBack.status).toBe("rolled-back");
    expect((await fixture.storage.getPageBatch(completed.id, 0, 1))[0]).toMatchObject({
        state: "rolled-back",
        deletedAfterMigration: true,
    });
    expect(await fixture.repository.getPage("/existing")).toBeNull();
});

test("preserves unrelated collection installations during rollback", async () => {
    const fixture = await rollbackFixture();
    const completed = await fixture.service.execute("site", [{ digest: fixture.next.digest }], 1);
    const companion = await fixture.collections.importRelease({
        ...release("1.0.0", "companion-widget", false),
        collectionId: "companion",
        publisherId: "companion.official",
    });
    await fixture.collections.install("site", companion.digest, 2);

    await fixture.service.rollback("site", completed.id);
    const snapshot = await fixture.collections.snapshot("site");
    expect(snapshot.collections.map(({ collectionId }) => collectionId).sort()).toEqual(["atlas", "companion"]);
    expect(snapshot.collections.find(({ collectionId }) => collectionId === "companion")?.digest).toBe(
        companion.digest,
    );
});

async function rollbackFixture() {
    const collections = new CollectionStore(new MemoryCollectionStorage());
    const previous = await collections.importRelease(release("1.0.0", "atlas-card", false));
    const next = await collections.importRelease({
        ...release("2.0.0", "atlas-panel", true),
        dataGeneration: 2,
        migrations: [
            {
                fromGeneration: 1,
                toGeneration: 2,
                operations: [{ kind: "rename-bloc", from: "atlas-card", to: "atlas-panel" }],
            },
        ],
    });
    await collections.install("site", previous.digest, 0);
    const repository = new ValidatingCmsRepository(
        withInstalledCollections(new InMemoryCmsRepository(), collections, "site"),
    );
    await repository.insertPage("/existing", "Existing", "<atlas-card></atlas-card>");
    const storage = new MemoryCollectionMigrationStorage();
    return {
        collections,
        next,
        repository,
        storage,
        service: new CollectionMigrationService(repository, collections, storage),
    };
}

function stableShell() {
    return {
        id: "stable-shell",
        name: "Stable shell",
        group: "Test",
        description: "",
        viewJS: "",
        collectionSlots: { content: { accepts: [{ kind: "rich-text" as const, profile: "prose" as const }] } },
        ownership: { kind: "code-managed" as const },
    };
}

function release(version: string, blocId: string, extended: boolean): Record<string, unknown> {
    return {
        kind: "collection",
        protocol: "ulvia-collection/v1",
        schemaDialect: "ulvia-schema/v1",
        collectionId: "atlas",
        publisherId: "atlas.official",
        version,
        name: "collection.name",
        locale: "en",
        translations: {
            en: {
                "collection.name": "Atlas",
                "bloc.label": "Bloc",
                "theme.label": "Theme",
                "theme.category.label": "Colors",
                "theme.token.label": "Brand",
                "text.category.content": "Content",
                "text.group.general": "General",
                "text.label.new-title": "New title",
            },
        },
        assets: [],
        texts: extended
            ? [
                  {
                      id: "new-title",
                      label: "text.label.new-title",
                      category: "text.category.content",
                      group: "text.group.general",
                      values: { en: "New" },
                  },
              ]
            : [],
        blocs: [
            {
                kind: "component",
                id: blocId,
                label: "bloc.label",
                shadowdom: '<div><slot name="content"></slot></div>',
                uses: [],
                requires: [],
                slots: { content: { accepts: [{ kind: "rich-text", profile: "prose" }] } },
            },
        ],
        theme: {
            label: "theme.label",
            categories: extended
                ? [
                      {
                          id: "colors",
                          label: "theme.category.label",
                          tokens: [
                              {
                                  id: "brand",
                                  label: "theme.token.label",
                                  type: "color",
                                  defaults: { light: "#123456" },
                              },
                          ],
                      },
                  ]
                : [],
        },
    };
}
