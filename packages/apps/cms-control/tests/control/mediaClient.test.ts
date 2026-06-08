import { describe, test, expect } from "bun:test";
import { toLocal, cmsFilesIdUrl, type FilesItem } from "cms-control/components/media/GridMedia/api/client";

const fileItem = (over: Partial<FilesItem> = {}): FilesItem => ({
    id: "01h-abc", name: "hero.png", parentId: null, type: "file",
    createdAt: "", updatedAt: "", size: 3, mimeType: "image/png",
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

    test("folders carry no URL", () => {
        const local = toLocal(fileItem({ type: "folder", mimeType: undefined, size: undefined }));
        expect(local.type).toBe("folder");
        expect(local.absoluteURL).toBeUndefined();
    });
});
