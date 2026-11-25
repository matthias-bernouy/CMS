import { expect, test } from "bun:test";
import { createHttpErrorPages, staticErrorResponse, selectErrorLanguage } from "@bernouy/http-runner/html";

test("offline error documents escape host branding and have no scripts, forms or external dependencies", () => {
    for (const language of ["en", "fr"] as const) {
        const pages = createHttpErrorPages('Example <script>alert(1)</script> "', language);
        for (const [status, page] of Object.entries(pages)) {
            expect(page).toContain(`<html lang="${language}">`);
            expect(page).toContain(status);
            expect(page).toContain("&lt;script&gt;");
            expect(page).not.toContain("<script");
            expect(page).not.toMatch(/<form|https?:|src=/u);
        }
    }
    expect(() => createHttpErrorPages(" ")).toThrow();
    expect(() => createHttpErrorPages("Ulvia", 'en" onclick="alert(1)' as never)).toThrow();
    expect(() => createHttpErrorPages("x".repeat(81))).toThrow();
});
test("language preferences honor region, weight, order, exclusions and explicit page language", () => {
    for (const [header, expected] of [
        ["fr-FR,fr;q=0.9,en;q=0.8", "fr"],
        ["en;q=0.5,fr;q=0.9", "fr"],
        ["fr;q=0,en;q=0.2", "en"],
        ["de,FR-ca;q=0.8", "fr"],
        ["en;q=0.7,fr;q=0.7", "en"],
        ["fr;q=0.7,en;q=0.7", "fr"],
        ["fr;q=wat,en", "en"],
        ["fr;q=0;q=1,en", "en"],
        ["fr;q=1.001,en", "en"],
        ["*", "en"],
    ]) {
        expect(selectErrorLanguage(header)).toBe(expected);
    }
    expect(selectErrorLanguage("en", "fr-CA")).toBe("fr");
    expect(selectErrorLanguage("fr", "en-US")).toBe("en");
    expect(selectErrorLanguage("x".repeat(4097))).toBe("en");
});
test("HEAD is bodyless and conditional error requests retain their status and language", async () => {
    const pages = createHttpErrorPages("Ulvia", "fr");
    for (const status of [404, 410, 500, 503] as const) {
        const request = new Request("http://site.test/<unsafe>?private=secret", { headers: { "if-none-match": "*" } });
        const response = staticErrorResponse(request, status, pages, undefined, "fr");
        expect(response.status).toBe(status);
        expect(response.headers.get("content-language")).toBe("fr");
        expect(response.headers.get("vary")).toBe("Accept-Language");
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
        expect(await response.text()).not.toContain("private=secret");
        const head = staticErrorResponse({ method: "HEAD" }, status, pages, undefined, "fr");
        expect(head.body).toBeNull();
        expect(head.status).toBe(status);
    }
});
