export type LanguageOption = {
    code: string;
    label: string;
    nativeName: string;
    flag: string;
};

export const offeredLanguages: LanguageOption[] = [
    { code: "de", label: "German", nativeName: "Deutsch", flag: "🇩🇪" },
    { code: "en", label: "English", nativeName: "English", flag: "🇬🇧" },
    { code: "es", label: "Spanish", nativeName: "Español", flag: "🇪🇸" },
    { code: "fr", label: "French", nativeName: "Français", flag: "🇫🇷" },
    { code: "it", label: "Italian", nativeName: "Italiano", flag: "🇮🇹" },
    { code: "ja", label: "Japanese", nativeName: "日本語", flag: "🇯🇵" },
    { code: "nl", label: "Dutch", nativeName: "Nederlands", flag: "🇳🇱" },
    { code: "pl", label: "Polish", nativeName: "Polski", flag: "🇵🇱" },
    { code: "pt", label: "Portuguese", nativeName: "Português", flag: "🇵🇹" },
    { code: "zh", label: "Chinese", nativeName: "中文", flag: "🇨🇳" },
];

const englishNames = new Intl.DisplayNames(["en"], { type: "language" });
const collator = new Intl.Collator("en", { sensitivity: "base" });

export function languageOption(code: string): LanguageOption {
    const offered = offeredLanguages.find((option) => option.code.toLowerCase() === code.toLowerCase());
    if (offered) {
        return offered;
    }
    let region = "";
    try {
        region = new Intl.Locale(code).region ?? "";
    } catch {
        // Preserve older site values even when they are not in the offered list.
    }
    const flag = /^[A-Z]{2}$/u.test(region)
        ? String.fromCodePoint(...[...region].map((letter) => 127397 + letter.codePointAt(0)!))
        : "🌐";
    let label = code;
    try {
        label = englishNames.of(code) ?? code;
    } catch {
        // Keep unfamiliar legacy values visible instead of losing the row.
    }
    return { code, label, nativeName: "", flag };
}

export function sortLanguages(codes: Iterable<string>): string[] {
    return [...codes].sort((left, right) => collator.compare(languageOption(left).label, languageOption(right).label));
}
