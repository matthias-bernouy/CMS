import { compareSemVer, releaseChannel } from "@bernouy/ulvia-contracts/compatibility";
import { canonicalIJsonBytes } from "@bernouy/ulvia-contracts/protocol";
import { verifyStoredCollectionRelease } from "../../../core/admission/collectionArtifact";
import { resolveCollectionTranslation } from "../../../core/texts/translationCatalogue";
import type { CollectionRepositorySource } from "../../../sources/interfaces";
import { initializationCatalogue } from "./catalogue";
import { initializationError } from "./state";
import { initializationDigest } from "../planning/plan";

/** Four latest stable collections per page, metadata only; no executable bundle hydration. */
export async function discoverInitializationRecipes(source: CollectionRepositorySource, cursor = "", locale?: string) {
    const catalogue = (await initializationCatalogue(source))
        .filter(({ version }) => releaseChannel(version) === "stable")
        .sort((a, b) =>
            a.collectionId < b.collectionId
                ? -1
                : a.collectionId > b.collectionId
                  ? 1
                  : compareSemVer(b.version, a.version),
        );
    const latest = [...new Map(catalogue.toReversed().map((entry) => [entry.collectionId, entry])).values()].sort(
        (a, b) => (a.collectionId < b.collectionId ? -1 : 1),
    );
    const digest = initializationDigest(latest);
    const [version, rawOffset] = cursor ? cursor.split("/") : [digest, "0"];
    const offset = Number(rawOffset);
    if (
        version !== digest ||
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        offset > latest.length ||
        (cursor !== "" && cursor !== `${digest}/${offset}`)
    ) {
        throw initializationError("Initialization catalogue cursor is stale", 409);
    }
    const items = [];
    for (const entry of latest.slice(offset, offset + 4)) {
        const artifact = await verifyStoredCollectionRelease(await source.getMetadata(entry), entry.digest);
        if (
            artifact.release.collectionId !== entry.collectionId ||
            artifact.release.publisherId !== entry.publisherId ||
            artifact.release.version !== entry.version
        ) {
            throw initializationError("Initialization catalogue release mismatch", 409);
        }
        for (const recipe of artifact.release.bootstraps ?? []) {
            items.push({
                root: {
                    publisherId: entry.publisherId,
                    collectionId: entry.collectionId,
                    version: entry.version,
                    digest: entry.digest,
                    bootstrapId: recipe.id,
                },
                label: resolveCollectionTranslation(artifact.release, recipe.label, locale ?? artifact.release.locale),
                description: resolveCollectionTranslation(
                    artifact.release,
                    recipe.description,
                    locale ?? artifact.release.locale,
                ),
                pageCount: recipe.pages.length,
                includeCount: recipe.includes.length,
            });
        }
    }
    if (canonicalIJsonBytes(items, 64).byteLength > 1024 * 1024) {
        throw initializationError("Initialization discovery response is too large");
    }
    return { items, cursor: offset + 4 < latest.length ? `${digest}/${offset + 4}` : "" };
}
