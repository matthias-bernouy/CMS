export type ErrorPageLanguage = "en" | "fr";
const language = (value: string): ErrorPageLanguage | undefined => {
    const base = value.trim().toLowerCase().split("-")[0];
    return base === "en" || base === "fr" ? base : undefined;
};
/** Resolve supported page language first, then bounded weighted browser preferences. */
export function selectErrorLanguage(header: string | null | undefined, pageLanguage?: string): ErrorPageLanguage {
    const preferred = pageLanguage ? language(pageLanguage) : undefined;
    if (preferred) {
        return preferred;
    }
    let selected: ErrorPageLanguage = "en",
        best = 0;
    if (!header || header.length > 4096) {
        return selected;
    }
    for (const token of header.split(",").slice(0, 32)) {
        const [tag = "", ...parameters] = token.trim().toLowerCase().split(";");
        const supported = language(tag);
        if (!supported || parameters.length > 1) {
            continue;
        }
        let quality = 1;
        for (const parameter of parameters) {
            const value = parameter.trim();
            if (!/^q=(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/u.test(value)) {
                quality = 0;
                break;
            }
            quality = Number(value.slice(2));
        }
        if (quality > best) {
            selected = supported;
            best = quality;
        }
    }
    return selected;
}
