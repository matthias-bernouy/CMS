/**
 * Bloc grouping by SIGNATURE — the algorithmic core of the grouped-delivery
 * path (the manifest layer feeds it page data; `resolveAssets` consumes the
 * result). Pure: no I/O, deterministic.
 *
 * A bloc's *signature* = the exact set of pages that use it. Blocs with an
 * identical signature always co-occur, so bundling them together is LOSSLESS
 * (a page that needs one needs all of them — zero over-fetch by construction).
 * The universal core, the per-cluster groups, and the rare singleton tails all
 * emerge from this single rule: no hand-assigned categories, no frequency
 * ranking (which would wrongly pull cluster-only blocs into a site-wide core),
 * and no similarity threshold.
 */

export type BlocGroups = {
    /** group id → its bloc tags (sorted, deterministic). The id IS the sorted
     *  tags joined by "-", so it is stable as long as the membership is. */
    groups: Map<string, string[]>;
    /** bloc tag → the id of the group it belongs to. */
    tagToGroup: Map<string, string>;
};

/**
 * @param pageBlocSets one entry per page = the bloc tags that page renders
 *                     (e.g. `findUsedBlocTags` over each stored page).
 */
export function groupBlocsBySignature(pageBlocSets: string[][]): BlocGroups {
    // 1. bloc tag → set of page indices that use it (its signature).
    const signatureOf = new Map<string, Set<number>>();
    pageBlocSets.forEach((tags, pageIdx) => {
        for (const tag of new Set(tags)) {
            let sig = signatureOf.get(tag);
            if (!sig) {
                sig = new Set<number>();
                signatureOf.set(tag, sig);
            }
            sig.add(pageIdx);
        }
    });

    // 2. bucket tags by identical signature (canonicalised as sorted indices).
    const buckets = new Map<string, string[]>();
    for (const [tag, sig] of signatureOf) {
        const sigKey = [...sig].sort((a, b) => a - b).join(",");
        const bucket = buckets.get(sigKey);
        if (bucket) {
            bucket.push(tag);
        } else {
            buckets.set(sigKey, [tag]);
        }
    }

    // 3. each bucket → a group keyed on its sorted tags (deterministic).
    const groups = new Map<string, string[]>();
    const tagToGroup = new Map<string, string>();
    for (const tags of buckets.values()) {
        const sorted = tags.sort();
        const groupId = sorted.join("-");
        groups.set(groupId, sorted);
        for (const tag of sorted) {
            tagToGroup.set(tag, groupId);
        }
    }

    return { groups, tagToGroup };
}
