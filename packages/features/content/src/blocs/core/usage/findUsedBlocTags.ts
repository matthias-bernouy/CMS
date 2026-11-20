/** Compile exact identities once for a rendering catalogue, retaining its declaration order. */
export function createBlocTagFinder(blocList: { id: string }[]): (content: string) => string[] {
    const patterns = blocList.map(({ id }) => ({
        id,
        pattern: new RegExp(`\\bcms-bloc\\s*=\\s*(["'])${id.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\1`, "i"),
    }));
    return (content) => patterns.filter(({ pattern }) => pattern.test(content)).map(({ id }) => id);
}

/** Scan content for exact `cms-bloc` identities. */
export function findUsedBlocTags(content: string, blocList: { id: string }[]): string[] {
    return createBlocTagFinder(blocList)(content);
}
