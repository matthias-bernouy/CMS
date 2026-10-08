import { describe, test, expect } from "bun:test";
import { parseHTML } from "linkedom";
import type { TPage, TSystem } from "@bernouy/cms-content";
import { defineMetaTags } from "cms-delivery/core/seo/defineMetaTags";

const page = { title: "Home", description: "d", path: "/" } as TPage;
const settings = (favicon?: string) => ({ site: { favicon, host: "" } }) as TSystem;

function faviconHref(rawFavicon: string | undefined, stableUrl = "/favicon.ico"): string {
    const { document } = parseHTML("<!DOCTYPE html><html><head></head><body></body></html>");
    defineMetaTags(
        document as unknown as Document,
        document.head as unknown as HTMLElement,
        page,
        settings(rawFavicon),
        stableUrl,
    );
    return document.querySelector('link[rel="icon"]')!.getAttribute("href")!;
}

describe("defineMetaTags favicon", () => {
    test("uses a generic immutable capability URL supplied by the renderer", () => {
        const url = "/.cms/call/ulvia.cms.files/files/file/generation";
        expect(faviconHref(url, url)).toBe(url);
    });

    test("does not expose a legacy favicon URL in rendered metadata", () => {
        expect(faviconHref("/x/media?foo=1")).toBe("/favicon.ico");
    });

    test("uses the same stable URL when no favicon is set", () => {
        expect(faviconHref(undefined)).toBe("/favicon.ico");
    });
});
