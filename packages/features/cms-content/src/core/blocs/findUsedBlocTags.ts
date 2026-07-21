import { escapeRegex } from "cms-content/core/utils/escapeRegex";

/**
 * Scan content for references to registered bloc tags.
 *
 * Tag-name anchored regex so `<my-bloc>` matches but `<my-bloc-extended>`
 * does not. Case-insensitive because HTML tag names are.
 */
export function findUsedBlocTags(content: string, blocList: { id: string }[]): string[] {
    const used: string[] = [];
    for (const bloc of blocList) {
        const re = new RegExp(`<${escapeRegex(bloc.id)}(\\s|>|/)`, "i");
        if (re.test(content)) {
            used.push(bloc.id);
        }
    }
    return used;
}
