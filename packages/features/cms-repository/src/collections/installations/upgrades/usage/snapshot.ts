import { createHash } from "node:crypto";
import { canonicalizeIJson } from "cms-repository/exports/contracts/protocol";
import type { ContentRepository } from "@bernouy/cms-content";
import type { CollectionStore } from "../../core/CollectionStore";
import { collectionPageBatches } from "./pageScan";
import type { UsageContributor } from "./interfaces";

export function usageDigest(value: unknown): string {
    return `sha256:${createHash("sha256")
        .update(canonicalizeIJson(JSON.parse(JSON.stringify(value))))
        .digest("hex")}`;
}

export async function readUsageSnapshot(
    repository: ContentRepository,
    collections: CollectionStore,
    siteId: string,
    contributors: readonly UsageContributor[],
) {
    if (new Set(contributors.map(({ id }) => id)).size !== contributors.length) {
        throw new TypeError("Usage contributor IDs must be unique");
    }
    const [installed, system, records, extensionSnapshots] = await Promise.all([
        collections.snapshot(siteId),
        repository.getSystem(),
        repository.getBlocRecords(),
        Promise.all(
            contributors.map(async (contributor) => {
                try {
                    return { id: contributor.id, ...(await contributor.snapshot(siteId)) };
                } catch {
                    return {
                        id: contributor.id,
                        revision: "unavailable",
                        complete: false,
                        references: [],
                        unknown: [`Consumer ${contributor.id} could not be analysed`],
                    };
                }
            }),
        ),
    ]);
    const pages = [];
    for await (const batch of collectionPageBatches(repository)) {
        pages.push(...batch);
    }
    const revisions = {
        collections: String(installed.revision),
        pages: usageDigest(pages),
        blocs: usageDigest(records),
        system: usageDigest(system),
        ...Object.fromEntries(extensionSnapshots.map((snapshot) => [`consumer:${snapshot.id}`, usageDigest(snapshot)])),
    };
    return { installed, system, records, pages, extensionSnapshots, revisions, digest: usageDigest(revisions) };
}
export type UsageSnapshot = Awaited<ReturnType<typeof readUsageSnapshot>>;
