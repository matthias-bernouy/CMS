import { expect, test } from "bun:test";
import { parsePublicationUpload } from "@bernouy/repository/repository/publication";
import { resolveCollectionTranslation, parseCollectionReleaseJson } from "@bernouy/repository/collections";
import { performanceCapabilityInventory } from "../../../../capabilities/inventory";
import { publicResourceFactory } from "../metadata/factory";
import { assertCatalogueRow } from "../metadata/oracle";
import { expectedRecipes } from "../discovery/background";
import { recipeOracle } from "../discovery/oracle";
import { buildReadSources } from "../system/workload";
import { publicationCollection } from "../../resources/collection";

test("all discovery resources are really admitted with unique coordinates and independent metadata; bootstraps preserve English and French", async () => {
    const inventory = await performanceCapabilityInventory();
    const implementation = inventory.targets.find((row) => row.release.contractId === "ulvia/cms.content")!.release;
    const create = await publicResourceFactory(`a000-performance-discovery-${"a".repeat(32)}`, implementation, true);
    for (const kind of ["collection", "contract", "provider-manifest"] as const) {
        const first = await create(kind, 0, 0);
        const second = await create(kind, 63, 32);
        expect(first.reference.id).not.toBe(second.reference.id);
        expect(first.reference.digest).not.toBe(second.reference.digest);
        for (const resource of [first, second]) {
            const parsed = parsePublicationUpload(resource.manifest);
            expect(parsed.canonicalJson).toBe(resource.canonicalJson);
            expect(parsed.kind).toBe(kind);
            expect(parsed.assets).toHaveLength(resource.assets.length);
            const stamp = Date.now();
            const expected = { ...resource, startedAt: stamp, finishedAt: stamp };
            const row = {
                ...resource.reference,
                metadata: {
                    ...resource.metadata,
                    ...(kind === "contract" ? { publishedAt: new Date(stamp).toISOString() } : {}),
                },
            };
            expect(() => assertCatalogueRow(row, expected)).not.toThrow();
            expect(() => assertCatalogueRow({ ...row, digest: "wrong" }, expected)).toThrow();
            if (kind === "collection") {
                const release = parseCollectionReleaseJson(resource.canonicalJson);
                expect(resolveCollectionTranslation(release, release.name)).toBe(resource.name);
                expect(resolveCollectionTranslation(release, release.description!)).toBe(resource.description);
                expect(release.bootstraps).toHaveLength(2);
                for (const locale of ["en", "fr"]) {
                    const recipes = expectedRecipes([], expected, locale);
                    expect(recipes).toHaveLength(2);
                    expect(recipes[0]!.label).toBe(locale === "fr" ? `${resource.name} FR` : resource.name);
                    const assert = recipeOracle(recipes, 0, 1);
                    const value = { items: recipes.slice(0, 1), cursor: `${"a".repeat(64)}/1` };
                    expect(() => assert(value)).not.toThrow();
                    expect(() => assert({ ...value, items: [] })).toThrow();
                }
            }
        }
    }
}, 30_000);

test("build invalidation uses 65 admitted components and examples rather than a delayed mock operation", async () => {
    const inventory = await performanceCapabilityInventory();
    const implementation = inventory.targets.find((row) => row.release.contractId === "ulvia/cms.content")!.release;
    const namespace = `performance-${"a".repeat(32)}`;
    const resource = await publicationCollection(namespace, implementation, buildReadSources(namespace));
    const release = parseCollectionReleaseJson(resource.canonicalJson);
    expect(release.blocs).toHaveLength(65);
    expect(release.examples).toHaveLength(65);
    expect(Buffer.byteLength(resource.canonicalJson)).toBeLessThan(512 * 1024);
    expect(parsePublicationUpload(resource.manifest).sourceJson).toBe(resource.sourceJson);
}, 30_000);
