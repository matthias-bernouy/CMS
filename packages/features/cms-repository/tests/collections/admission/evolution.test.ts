import { expect, test } from "bun:test";
import { parseCollectionRelease, verifyCollectionPublicationEvolution } from "../../../src/exports/collections";
import { collectionDocument, component } from "../fixtures";

function release(version: string, update: (source: Record<string, unknown>) => void = () => {}) {
    const source = collectionDocument();
    source.version = version;
    update(source);
    return parseCollectionRelease(source);
}

test("collection publication separates implementation, compatible contract and breaking changes", async () => {
    const initial = release("1.0.0");
    const implementation = release("1.0.1", (source) => {
        (source.blocs as Record<string, unknown>[])[0]!.style = ":host { display: grid; }";
    });
    await expect(verifyCollectionPublicationEvolution(initial, implementation)).resolves.toBeUndefined();

    const patchContract = release("1.0.1", (source) => {
        (source.blocs as Record<string, unknown>[]).push({ ...component(), id: "atlas-card" });
    });
    await expect(verifyCollectionPublicationEvolution(initial, patchContract)).rejects.toThrow("implementations only");

    const minorContract = release("1.1.0", (source) => {
        (source.blocs as Record<string, unknown>[]).push({ ...component(), id: "atlas-card" });
    });
    await expect(verifyCollectionPublicationEvolution(initial, minorContract)).resolves.toBeUndefined();
});

test("breaking resources require a major, their own generation and one adjacent data migration", async () => {
    const initial = release("1.0.0");
    const breaking = (version: string, generation: number, dataGeneration: number) =>
        release(version, (source) => {
            source.dataGeneration = dataGeneration;
            source.migrations = Array.from({ length: dataGeneration - 1 }, (_, index) => ({
                fromGeneration: index + 1,
                toGeneration: index + 2,
                operations: [],
            }));
            const panel = (source.blocs as Record<string, unknown>[])[0]!;
            panel.generation = generation;
            panel.slots = { body: { max: 1 } };
        });

    await expect(verifyCollectionPublicationEvolution(initial, breaking("1.1.0", 2, 2))).rejects.toThrow("Minor");
    await expect(verifyCollectionPublicationEvolution(initial, breaking("2.0.0", 1, 2))).rejects.toThrow(
        "must increase its generation",
    );
    await expect(verifyCollectionPublicationEvolution(initial, breaking("2.0.0", 2, 1))).rejects.toThrow(
        "data-generation migration",
    );
    await expect(verifyCollectionPublicationEvolution(initial, breaking("2.0.0", 2, 3))).rejects.toThrow(
        "adjacent step",
    );
    await expect(verifyCollectionPublicationEvolution(initial, breaking("2.0.0", 2, 2))).resolves.toBeUndefined();
});

test("publication rejects restricted capabilities, dependency provenance changes and generation regressions", async () => {
    const requirement = { contractId: "catalog.items", capabilityId: "item.list", versionRange: "^1.0.0" };
    const initial = release("1.0.0", (source) => {
        const panel = (source.blocs as Record<string, unknown>[])[0]!;
        panel.generation = 2;
        panel.requires = [requirement];
        source.dependencies = [
            {
                collectionId: "shared-ui",
                publisherId: "atlas.official",
                versionRange: "^1.0.0",
                imports: { blocs: [{ id: "shared-ui-card", generation: 1 }], themeTokens: [] },
            },
        ];
    });
    const update = (mutate: (source: Record<string, unknown>) => void, version = "1.1.0") =>
        release(version, (source) => {
            const panel = (source.blocs as Record<string, unknown>[])[0]!;
            panel.generation = 2;
            panel.requires = [requirement];
            source.dependencies = [
                {
                    collectionId: "shared-ui",
                    publisherId: "atlas.official",
                    versionRange: "^1.0.0",
                    imports: { blocs: [{ id: "shared-ui-card", generation: 1 }], themeTokens: [] },
                },
            ];
            mutate(source);
        });

    await expect(
        verifyCollectionPublicationEvolution(
            initial,
            update((source) => {
                (source.blocs as Record<string, unknown>[])[0]!.requires = [
                    { ...requirement, versionRange: ">=1.2.0 <2.0.0" },
                ];
            }),
        ),
    ).rejects.toThrow("Minor");
    await expect(
        verifyCollectionPublicationEvolution(
            initial,
            update((source) => {
                (source.dependencies as Record<string, unknown>[])[0]!.publisherId = "other.publisher";
            }),
        ),
    ).rejects.toThrow("Minor");
    await expect(
        verifyCollectionPublicationEvolution(
            initial,
            update((source) => {
                (source.blocs as Record<string, unknown>[])[0]!.generation = 1;
            }),
        ),
    ).rejects.toThrow("generation decreased");
    await expect(
        verifyCollectionPublicationEvolution(
            initial,
            update(() => {}, "1.0.0"),
        ),
    ).rejects.toThrow("version must increase");
});
