/** Derives a canonical, single-segment page path from a human title. */
export function derivePagePath(title: string): string {
    const slug = title
        .normalize("NFKD")
        .replace(/œ/gi, "oe")
        .replace(/æ/gi, "ae")
        .replace(/ß/gi, "ss")
        .replace(/\p{Mark}+/gu, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return slug ? `/${slug}` : "";
}
