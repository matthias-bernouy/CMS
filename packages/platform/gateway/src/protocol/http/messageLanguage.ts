export type MessageLanguage = "en" | "fr";

/** Match supported regional preferences by quality, preserving caller order on ties. */
export function negotiateMessageLanguage(acceptLanguage: string | null | undefined): MessageLanguage {
    const ranges = (acceptLanguage ?? "")
        .slice(0, 4096)
        .split(",")
        .flatMap((part, order) => {
            const match =
                /^\s*(\*|[a-z]{1,8}(?:-[a-z0-9]{1,8})*)(?:\s*;\s*q=(0(?:\.\d{0,3})?|1(?:\.0{0,3})?))?\s*$/iu.exec(part);
            return match ? [{ range: match[1]!.toLowerCase(), quality: Number(match[2] ?? 1), order }] : [];
        });
    const candidates = (["en", "fr"] as const).map((language) => {
        const exact = ranges.filter(({ range }) => range === language || range.startsWith(`${language}-`));
        const matches = exact.length ? exact : ranges.filter(({ range }) => range === "*");
        const selected = matches.toSorted((left, right) => right.quality - left.quality || left.order - right.order)[0];
        return { language, quality: selected?.quality ?? 0, order: selected?.order ?? Infinity };
    });
    candidates.sort((left, right) => right.quality - left.quality || left.order - right.order);
    // With no acceptable supported language, use the documented default representation.
    return candidates[0]?.quality ? candidates[0].language : "en";
}
