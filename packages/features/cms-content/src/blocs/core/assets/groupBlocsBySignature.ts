export type BlocGroups = {
    groups: Map<string, string[]>;
    tagToGroup: Map<string, string>;
};

/** Group Blocs that occur on exactly the same set of published Pages. */
export function groupBlocsBySignature(pageBlocSets: string[][]): BlocGroups {
    const signatureOf = new Map<string, Set<number>>();
    pageBlocSets.forEach((tags, pageIndex) => {
        for (const tag of new Set(tags)) {
            const signature = signatureOf.get(tag) ?? new Set<number>();
            signature.add(pageIndex);
            signatureOf.set(tag, signature);
        }
    });

    const buckets = new Map<string, string[]>();
    for (const [tag, signature] of signatureOf) {
        const key = [...signature].sort((left, right) => left - right).join(",");
        const tags = buckets.get(key) ?? [];
        tags.push(tag);
        buckets.set(key, tags);
    }

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
