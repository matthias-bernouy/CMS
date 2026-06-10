import { describe, test, expect } from "bun:test";
import { parseHTML } from "linkedom";
import type { TPage, TSystem } from "@bernouy/cms-shared";
import { defineMetaTags } from "cms-delivery/core/seo/defineMetaTags";

const page = { title: "Home", description: "d", path: "/" } as TPage;
const settings = (favicon?: string) => ({ site: { favicon } }) as TSystem;

function faviconHref(rawFavicon: string | undefined, fallback = "/default.ico"): string {
    const { document } = parseHTML("<!DOCTYPE html><html><head></head><body></body></html>");
    defineMetaTags(document as unknown as Document, document.head as unknown as HTMLElement, page, settings(rawFavicon), fallback);
    return document.querySelector('link[rel="icon"]')!.getAttribute("href")!;
}

describe("defineMetaTags favicon", () => {
    test("emits an opaque by-id favicon URL unchanged (no resize rewrite)", () => {
        expect(faviconHref("/.cms/files/by-id/01h-abc")).toBe("/.cms/files/by-id/01h-abc");
    });

    test("a legacy `/media?...` URL is no longer rewritten (resize endpoint is gone)", () => {
        expect(faviconHref("/x/media?foo=1")).toBe("/x/media?foo=1");
    });

    test("falls back to the default when no favicon is set", () => {
        expect(faviconHref(undefined)).toBe("/default.ico");
    });
});
