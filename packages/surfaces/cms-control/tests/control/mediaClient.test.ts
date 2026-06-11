import { describe, test, expect } from "bun:test";
import { toLocal, cmsFilesIdUrl, type FilesItem } from "cms-control/components/media/GridMedia/api/client";
import { variantUrl } from "cms-control/components/media/GridMedia/types";
import { isMedia, mediaLabel } from "cms-control/components/editor/componentSync/PageLink/detect";

const fileItem = (over: Partial<FilesItem> = {}): FilesItem => ({
    id: "01h-abc", name: "hero.png", parentId: null, type: "file",
    createdAt: "", updatedAt: "", size: 3, mimeType: "image/png", contentHash: "abc123",
    ...over,
});

describe("GridMedia client — id-addressed URLs", () => {
    test("toLocal stores the opaque by-id URL built from the id", () => {
        const local = toLocal(fileItem());
        expect(local.absoluteURL).toBe("/.cms/files/by-id/01h-abc");
        expect(local.absoluteURL).not.toContain("hero.png"); // the name/path is not the stored form
    });

    test("an SVG keeps its mimetype so consumers can gate on it (no extension in the URL)", () => {
        const local = toLocal(fileItem({ name: "logo", mimeType: "image/svg+xml" }));
        expect(local.type).toBe("image");                // image/* → image
        expect(local.mimetype).toBe("image/svg+xml");
        expect(local.absoluteURL).toBe("/.cms/files/by-id/01h-abc");
    });

    test("cmsFilesIdUrl encodes the id", () => {
        expect(cmsFilesIdUrl("a b")).toBe("/.cms/files/by-id/a%20b");
    });

    test("PageLink media detection recognizes current by-id URLs", () => {
        expect(isMedia("/.cms/files/by-id/a%20b")).toBe(true);
        expect(mediaLabel("/cms/.cms/files/by-id/a%20b?v=h")).toBe("Media a b");
        expect(isMedia("/media?id=a")).toBe(false);
    });

    test("the DISPLAY url is cache-busted with ?v=contentHash; absoluteURL stays clean", () => {
        const local = toLocal(fileItem());
        expect(local.contentHash).toBe("abc123");
        // absoluteURL = the clean stored/copied form (no ?v)
        expect(local.absoluteURL).toBe("/.cms/files/by-id/01h-abc");
        // variantUrl = the display form, busted so a replaced file repaints
        expect(variantUrl(local)).toBe("/.cms/files/by-id/01h-abc?v=abc123");
    });

    test("variantUrl is the plain url when there is no contentHash", () => {
        const local = toLocal(fileItem({ contentHash: undefined }));
        expect(variantUrl(local)).toBe("/.cms/files/by-id/01h-abc");
    });

    test("folders carry no URL", () => {
        const local = toLocal(fileItem({ type: "folder", mimeType: undefined, size: undefined }));
        expect(local.type).toBe("folder");
        expect(local.absoluteURL).toBeUndefined();
    });
});
