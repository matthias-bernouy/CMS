import { CollectionPublicationError } from "../errors";
import {
    compareSemVer,
    isSemVerPrerelease,
    semVerMajor,
    semVerReleaseTarget,
} from "@bernouy/ulvia-contracts/compatibility";
import type { CollectionRelease } from "../../interfaces/CollectionRelease";
import { collectionUpgradeBreakingResources } from "../../installations/core/upgradeCompatibility";
import {
    collectionRequirementBreaks,
    verifyCollectionPublicationEvolution,
} from "cms-repository/collections/core/admission/evolution";

/** Preview ordering and stable resource guarantees are independent publication gates. */
export async function verifyCollectionPublicationHistory(
    published: readonly CollectionRelease[],
    next: CollectionRelease,
): Promise<void> {
    const history = published
        .filter((release) => release.collectionId === next.collectionId)
        .toSorted((left, right) => compareSemVer(right.version, left.version));
    const previousTarget = history.find(
        (release) => semVerReleaseTarget(release.version) === semVerReleaseTarget(next.version),
    );
    if (previousTarget && compareSemVer(next.version, previousTarget.version) <= 0) {
        throw new CollectionPublicationError("version_order");
    }
    const stable = history.filter((release) => !isSemVerPrerelease(release.version));
    const reference =
        stable.find((release) => semVerMajor(release.version) === semVerMajor(next.version)) ??
        stable.find((release) => compareSemVer(release.version, next.version) < 0);
    if (reference) {
        await verifyCollectionPublicationEvolution(reference, next);
    }
    // An identity stabilized on any maintained line cannot be narrowed or recycled.
    const retained = new Set([
        ...next.blocs.map((bloc) => `bloc:${bloc.id}`),
        ...(next.theme?.categories.flatMap((category) =>
            category.entries.filter((token) => token.type !== "font-face").map((token) => `theme-token:${token.id}`),
        ) ?? []),
        ...(next.texts?.map((text) => `text:${text.id}`) ?? []),
        ...next.assets.map((asset) => `asset:${asset.id}`),
        ...(next.states?.map((state) => `state:${state.id}`) ?? []),
    ]);
    for (const release of stable) {
        const [before, after] = compareSemVer(release.version, next.version) < 0 ? [release, next] : [next, release];
        if (collectionRequirementBreaks(before, after).length) {
            throw new CollectionPublicationError(
                "stable_resource",
                "Incompatible stable resource requirements require a new resource identity",
            );
        }
        const incompatible = collectionUpgradeBreakingResources(before, after).find(
            (resource) => resource.kind !== "configuration" && retained.has(`${resource.kind}:${resource.id}`),
        );
        if (incompatible) {
            throw new CollectionPublicationError(
                "stable_resource",
                `Incompatible stable ${incompatible.kind} ${incompatible.id} requires a new resource identity`,
                incompatible,
            );
        }
    }
}
