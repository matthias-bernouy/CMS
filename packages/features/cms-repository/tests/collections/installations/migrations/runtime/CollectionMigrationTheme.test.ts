import { expect, test } from "bun:test";
import { withInstalledCollections } from "@bernouy/cms-repository/collections/content";
import { CollectionStore, MemoryCollectionStorage } from "@bernouy/cms-repository/collections/installations";
import { InMemoryCmsRepository, ValidatingCmsRepository, type CmsRepository, type TSystem } from "@bernouy/cms-content";
import {
    CollectionMigrationService,
    MemoryCollectionMigrationStorage,
} from "@bernouy/cms-repository/collections/installations";

test("migrates a renamed theme token and restores its site override on rollback", async () => {
    const fixture = await themeFixture(themedRelease("1.0.0", "primary", "#112233"), {
        ...themedRelease("2.0.0", "brand", "#223344"),
        dataGeneration: 2,
        migrations: [
            {
                fromGeneration: 1,
                toGeneration: 2,
                operations: [{ kind: "rename-theme-token", from: "primary", to: "brand" }],
            },
        ],
    });
    const system = await fixture.repository.getSystem();
    system.theme.themes[0]!.values.light["atlas-primary"] = "#abcdef";
    await fixture.repository.updateSystem(system);

    const completed = await fixture.service.execute("site", [{ digest: fixture.next.digest }], 1);
    expect(completed.status).toBe("completed");
    expect((await fixture.repository.getSystem()).theme.themes[0]!.values.light).toMatchObject({
        "atlas-brand": "#abcdef",
    });

    const rolledBack = await fixture.service.rollback("site", completed.id);
    expect(rolledBack.status).toBe("rolled-back");
    expect((await fixture.repository.getSystem()).theme.themes[0]!.values.light).toMatchObject({
        "atlas-primary": "#abcdef",
    });
});

test("accepts an implementation-only theme default change without inventing a data migration", async () => {
    const fixture = await themeFixture(
        themedRelease("1.0.0", "primary", "#112233"),
        themedRelease("1.1.0", "primary", "#445566"),
    );

    const completed = await fixture.service.execute("site", [{ digest: fixture.next.digest }], 1);
    expect(completed.status).toBe("completed");
    expect(themeDefault(await fixture.repository.getSystem(), "atlas-primary")).toBe("#445566");

    const rolledBack = await fixture.service.rollback("site", completed.id);
    expect(rolledBack.status).toBe("rolled-back");
    expect(themeDefault(await fixture.repository.getSystem(), "atlas-primary")).toBe("#112233");
});

test("rolls back a theme migration that fails after the collection commit", async () => {
    const fixture = await themeFixture(themedRelease("1.0.0", "primary", "#112233"), {
        ...themedRelease("2.0.0", "brand", "#223344"),
        dataGeneration: 2,
        migrations: [
            {
                fromGeneration: 1,
                toGeneration: 2,
                operations: [{ kind: "rename-theme-token", from: "primary", to: "brand" }],
            },
        ],
    });
    const system = await fixture.repository.getSystem();
    system.theme.themes[0]!.values.light["atlas-primary"] = "#abcdef";
    await fixture.repository.updateSystem(system);
    let rejectSystemWrite = true;
    const interrupted = new Proxy(fixture.repository, {
        get(target, property) {
            if (property === "updateSystem" && rejectSystemWrite) {
                return async () => {
                    rejectSystemWrite = false;
                    throw new Error("simulated system write failure");
                };
            }
            const value = Reflect.get(target, property);
            return typeof value === "function" ? value.bind(target) : value;
        },
    }) as CmsRepository;
    const service = new CollectionMigrationService(
        interrupted,
        fixture.collections,
        new MemoryCollectionMigrationStorage(),
    );

    await expect(service.execute("site", [{ digest: fixture.next.digest }], 1)).rejects.toThrow(
        "simulated system write failure",
    );
    const active = await service.getActive("site");
    expect(active).toMatchObject({ status: "failed" });

    const rolledBack = await service.rollback("site", active!.id);
    expect(rolledBack.status).toBe("rolled-back");
    expect(themeDefault(await fixture.repository.getSystem(), "atlas-primary")).toBe("#112233");
});

async function themeFixture(previousRelease: Record<string, unknown>, nextRelease: Record<string, unknown>) {
    const collections = new CollectionStore(new MemoryCollectionStorage());
    const previous = await collections.importRelease(previousRelease);
    const next = await collections.importRelease(nextRelease);
    await collections.install("site", previous.digest, 0);
    const repository = new ValidatingCmsRepository(
        withInstalledCollections(new InMemoryCmsRepository(), collections, "site"),
    );
    return {
        collections,
        next,
        repository,
        service: new CollectionMigrationService(repository, collections, new MemoryCollectionMigrationStorage()),
    };
}

function themedRelease(version: string, tokenId: string, value: string): Record<string, unknown> {
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
                "theme.label": "Atlas theme",
                "theme.category.colors.label": "Colors",
                [`theme.token.${tokenId}.label`]: tokenId,
            },
        },
        assets: [],
        blocs: [],
        theme: {
            label: "theme.label",
            categories: [
                {
                    id: "colors",
                    label: "theme.category.colors.label",
                    tokens: [
                        {
                            id: tokenId,
                            label: `theme.token.${tokenId}.label`,
                            type: "color",
                            defaults: { light: value },
                        },
                    ],
                },
            ],
        },
    };
}

function themeDefault(system: TSystem, id: string): string | undefined {
    return system.theme.sources
        .flatMap((source: { categories: Array<{ tokens: Array<{ id: string; defaults?: { light?: string } }> }> }) =>
            source.categories.flatMap((category) => category.tokens),
        )
        .find((token: { id: string }) => token.id === id)?.defaults?.light;
}
