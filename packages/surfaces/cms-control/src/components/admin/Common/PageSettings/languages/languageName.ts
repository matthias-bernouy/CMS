export function languageName(code: string): string {
    try {
        return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code.toUpperCase();
    } catch {
        return code.toUpperCase();
    }
}
