/**
 * Scan content for exact `cms-bloc` identities.
 */
export function findUsedBlocTags(content: string, blocList: { id: string }[]): string[] {
    const used: string[] = [];
    for (const bloc of blocList) {
        const escaped = bloc.id.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
        const re = new RegExp(`\\bcms-bloc\\s*=\\s*(["'])${escaped}\\1`, "i");
        if (re.test(content)) {
            used.push(bloc.id);
        }
    }
    return used;
}
