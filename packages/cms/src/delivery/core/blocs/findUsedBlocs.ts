/**
 * Scan page content for references to every registered bloc tag and return
 * the list of tags actually used. The result drives which bloc bundles get
 * preloaded / script-tagged in the head.
 *
 * Tag-name anchored regex so `<my-bloc>` matches but `<my-bloc-extended>`
 * doesn't — the trailing character must be whitespace, `>` or `/` (self-
 * closing). Case-insensitive because HTML tag names are.
 */
export function findUsedBlocTags(
    content: string,
    blocList: { id: string }[],
): string[] {
    const used: string[] = [];
    for (const bloc of blocList) {
        const re = new RegExp(`<${bloc.id}(\\s|>|/)`, "i");
        if (re.test(content)) used.push(bloc.id);
    }
    return used;
}
