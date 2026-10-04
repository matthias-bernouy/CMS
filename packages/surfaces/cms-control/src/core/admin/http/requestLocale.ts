/** Best available UI locale until Control persists an explicit user preference. */
export function requestLocale(request: Request, fallback = "en"): string {
    const requested = (request.headers.get("accept-language") ?? "")
        .split(",")
        .map((entry) => entry.trim().split(";")[0])
        .find((entry) => entry && entry !== "*");
    try {
        return Intl.getCanonicalLocales(requested || fallback)[0]!;
    } catch {
        return Intl.getCanonicalLocales(fallback)[0] ?? "en";
    }
}
