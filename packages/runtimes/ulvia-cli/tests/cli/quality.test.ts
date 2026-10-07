import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseCollectionRelease } from "@bernouy/cms-repository/collections";
import { buildOfficialBootstrapArtifacts } from "../../src/bootstrap/generate";
import { assertCollectionSourceQuality } from "../../src/release/quality";
import { prepareCollectionRelease } from "../../src/release/source";
import { officialContractCatalogue } from "../officialContractCatalogue";

function release(style: string) {
    return parseCollectionRelease({
        kind: "collection",
        protocol: "ulvia-collection/v1",
        schemaDialect: "ulvia-schema/v1",
        collectionId: "example",
        publisherId: "example.official",
        version: "1.0.0",
        name: "collection.name",
        locale: "en",
        translations: {
            en: {
                "bloc.card.label": "Card",
                "collection.name": "Example",
                "theme.category.colors.label": "Colors",
                "theme.label": "Theme",
                "theme.token.primary.label": "Primary",
            },
        },
        theme: {
            label: "theme.label",
            categories: [
                {
                    id: "colors",
                    label: "theme.category.colors.label",
                    tokens: [
                        {
                            id: "primary",
                            label: "theme.token.primary.label",
                            type: "color",
                            defaults: { light: "#123456" },
                        },
                    ],
                },
            ],
        },
        assets: [],
        blocs: [
            {
                kind: "component",
                id: "example-card",
                label: "bloc.card.label",
                shadowdom: "<div></div>",
                style,
                slots: {},
                uses: [],
                requires: [],
            },
        ],
    });
}

test("collection source quality accepts theme tokens and declared Bloc properties", () => {
    expect(() =>
        assertCollectionSourceQuality(
            release(":host { --example-card-color: var(--example-primary); color: var(--example-card-color); }"),
        ),
    ).not.toThrow();
    expect(() => assertCollectionSourceQuality(release(":host { color: var(--example-prmary); }"))).toThrow(
        "unknown or unimported",
    );
});

test("the official collection passes its source quality contract", async () => {
    const source = resolve(import.meta.dir, "../../../../official-repository/collections/ulvia-official");
    const artifact = await prepareCollectionRelease(source, await officialContractCatalogue());
    const visible = artifact.release.blocs.filter((bloc) => !bloc.internal);
    expect(visible.every((bloc) => bloc.category !== undefined && bloc.order !== undefined)).toBeTrue();
    expect(new Set(visible.map((bloc) => `${bloc.category}:${bloc.order}`)).size).toBe(visible.length);
    expect(
        visible.every((bloc) => Object.values(bloc.slots).every((slot) => (slot.accepts?.length ?? 0) > 0)),
    ).toBeTrue();
    expect(
        visible.filter((bloc) => bloc.kind === "component").every((bloc) => bloc.style?.includes(":host")),
    ).toBeTrue();
    expect(visible.filter((bloc) => bloc.kind === "composition").every((bloc) => bloc.uses.length > 0)).toBeTrue();
    expect(Object.keys(artifact.release.translations.fr ?? {}).toSorted()).toEqual(
        Object.keys(artifact.release.translations.en ?? {}).toSorted(),
    );
    expect(
        artifact.release.texts?.every(
            (text) => text.values.en?.trim() && text.values.fr?.trim() && text.label && text.category && text.group,
        ),
    ).toBeTrue();
    expect(artifact.release.exports?.blocs).toEqual(visible.map((bloc) => bloc.id).toSorted());
});

test("the pre-built local bootstrap bundle matches official authored releases", async () => {
    const artifacts = await buildOfficialBootstrapArtifacts();
    const root = resolve(import.meta.dir, "../../src/bootstrap/resources");
    for (const [id, bytes] of Object.entries(artifacts.contracts)) {
        const segments = id.startsWith("ulvia.cms.") ? ["contracts", "cms", id] : ["contracts", id];
        expect((await readFile(join(root, ...segments, "definition.json"), "utf8")).trim()).toBe(bytes);
    }
    expect((await readFile(join(root, "providers", "ulvia.official", "definition.json"), "utf8")).trim()).toBe(
        artifacts.provider,
    );
    expect((await readFile(join(root, "collections", "ulvia-official", "release.json"), "utf8")).trim()).toBe(
        artifacts.collection,
    );
});
