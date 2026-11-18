import { sha256Digest } from "@bernouy/binary-media";
import { parseCollectionReleaseJson, resolveCollectionTranslation } from "@bernouy/repository/collections";
import { assertCondition, requireRecord } from "../../../queries/types";
import type { CollectionRelease } from "@bernouy/repository/collections";
import type { RegistryReadPorts, PublishedResource } from "../metadata/types";

export type RecipeRelease = Readonly<{ release: CollectionRelease; digest: string }>;
export async function backgroundRecipes(read: RegistryReadPorts, exclude: string) {
    const releases: RecipeRelease[] = [];
    const deadline = Date.now() + 180_000;
    let loadedBytes = 0;
    let cursor: unknown;
    const seen = new Set<string>();
    for (let page = 0; page < 64; page++) {
        const output = await read.fixture("collection-catalogue", {
            limit: 64,
            channel: "stable",
            ...(cursor ? { cursor } : {}),
        });
        assertCondition(Array.isArray(output.releases), "registry-recipes-background-catalogue");
        for (const raw of output.releases) {
            assertCondition(Date.now() < deadline, "registry-recipes-background-deadline");
            const ref = requireRecord(raw);
            if (ref.publisherId === exclude) {
                continue;
            }
            const key = `${ref.publisherId}:${ref.id}`;
            assertCondition(!seen.has(key), "registry-recipes-background-duplicate");
            seen.add(key);
            const value = await read.call("release-download", "http", {
                kind: "collection",
                publisherId: ref.publisherId,
                id: ref.id,
                version: ref.version,
            });
            assertCondition(
                value.observation.validated &&
                    value.output instanceof Uint8Array &&
                    (await sha256Digest(value.output)) === ref.digest,
                "registry-recipes-background-artifact-pin",
            );
            loadedBytes += value.output.byteLength;
            assertCondition(loadedBytes <= 64 * 1024 * 1024, "registry-recipes-background-byte-bound");
            const release = parseCollectionReleaseJson(new TextDecoder().decode(value.output));
            assertCondition(
                release.collectionId === ref.id &&
                    release.version === ref.version &&
                    release.publisherId === ref.publisherId,
                "registry-recipes-background-coordinate",
            );
            if (release.bootstraps?.length) {
                releases.push({ release, digest: String(ref.digest) });
            }
        }
        cursor = output.nextCursor;
        if (!cursor) {
            return releases;
        }
    }
    assertCondition(false, "registry-recipes-background-bound");
}

export function expectedRecipes(background: readonly RecipeRelease[], current: PublishedResource, locale: string) {
    const release = parseCollectionReleaseJson(current.canonicalJson);
    return [...background, { release, digest: current.reference.digest }]
        .toSorted((left, right) =>
            left.release.collectionId < right.release.collectionId
                ? -1
                : left.release.collectionId > right.release.collectionId
                  ? 1
                  : 0,
        )
        .flatMap(({ release: entry, digest }) =>
            (entry.bootstraps ?? []).map((bootstrap) => ({
                root: {
                    publisherId: entry.publisherId,
                    collectionId: entry.collectionId,
                    version: entry.version,
                    digest,
                    bootstrapId: bootstrap.id,
                },
                label: resolveCollectionTranslation(entry, bootstrap.label, locale),
                description: resolveCollectionTranslation(entry, bootstrap.description, locale),
                pageCount: bootstrap.pages.length,
                includeCount: bootstrap.includes.length,
            })),
        );
}
