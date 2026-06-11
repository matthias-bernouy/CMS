import { describe, expect, test } from "bun:test";
import {
    cmsFilesByIdPath,
    cmsFilesByIdRef,
    cmsFilesByIdUrl,
    cmsImageVariantPath,
    cmsImageVariantUrlFromByIdUrl,
    mediaIdFromUrl,
    withFileVersion,
} from "@bernouy/cms-files/urls";

describe("cms-files URL helpers", () => {
    test("builds encoded by-id paths and URLs", () => {
        expect(cmsFilesByIdPath("a b")).toBe("/.cms/files/by-id/a%20b");
        expect(cmsFilesByIdUrl("/cms", "a b")).toBe("/cms/.cms/files/by-id/a%20b");
        expect(cmsFilesByIdUrl("/", "a b")).toBe("/.cms/files/by-id/a%20b");
        expect(cmsFilesByIdRef("a b")).toBe("by-id/a%20b");
    });

    test("parses ids from tenant-prefixed by-id URLs", () => {
        expect(mediaIdFromUrl("/.cms/files/by-id/a%20b")).toBe("a b");
        expect(mediaIdFromUrl("/cms/.cms/files/by-id/01h?v=x")).toBe("01h");
        expect(mediaIdFromUrl("https://cdn.example/cms/.cms/files/by-id/01h#x")).toBe("01h");
        expect(mediaIdFromUrl("/.cms/files/path/logo.png")).toBeNull();
    });

    test("builds variant URLs from by-id URLs without string replacement in callers", () => {
        expect(cmsImageVariantPath("a b", 320)).toBe("/.cms/img/a%20b/320.webp");
        expect(cmsImageVariantUrlFromByIdUrl("/cms/.cms/files/by-id/a%20b", 640))
            .toBe("/cms/.cms/img/a%20b/640.webp");
    });

    test("adds cache-bust versions", () => {
        expect(withFileVersion("/x", "h")).toBe("/x?v=h");
        expect(withFileVersion("/x?a=1", "h")).toBe("/x?a=1&v=h");
    });
});
