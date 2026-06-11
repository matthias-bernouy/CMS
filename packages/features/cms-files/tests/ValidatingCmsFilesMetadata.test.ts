import { describe, test, expect } from "bun:test";
import {
    ValidatingCmsFilesMetadata,
    InMemoryCmsFilesMetadata,
    FileValidationError,
    MAX_UPLOAD_BYTES,
    validateUploadSize,
} from "@bernouy/cms-files";

const repo = () => new ValidatingCmsFilesMetadata(new InMemoryCmsFilesMetadata());

describe("ValidatingCmsFilesMetadata", () => {
    test("a valid folder is created with its name trimmed (normalization at the seam)", async () => {
        const r = repo();
        const folder = await r.createFolder({ name: "  images  ", parentId: null });
        expect(folder.name).toBe("images");
    });

    test("a nameless folder is rejected at the seam (.status 400)", async () => {
        await expect(repo().createFolder({ name: "   ", parentId: null })).rejects.toBeInstanceOf(FileValidationError);
        await expect(repo().createFolder({ name: "", parentId: null })).rejects.toMatchObject({ status: 400 });
    });

    test("a nameless file is rejected too", async () => {
        await expect(repo().createFile({ name: "", parentId: null, size: 3, mimeType: "text/plain" }))
            .rejects.toBeInstanceOf(FileValidationError);
    });

    test("path-like or traversal item names are rejected", async () => {
        const bad = ["a/b", "a\\b", "..", ".", "a..b", "nul\0byte"];
        for (const name of bad) {
            await expect(repo().createFolder({ name, parentId: null }))
                .rejects.toBeInstanceOf(FileValidationError);
            await expect(repo().createFile({ name, parentId: null, size: 1, mimeType: "text/plain" }))
                .rejects.toBeInstanceOf(FileValidationError);
        }
    });

    test("rename: empty name rejected, valid name trimmed; a move-only patch passes through", async () => {
        const r = repo();
        const folder = await r.createFolder({ name: "docs", parentId: null });
        await expect(r.updateItem(folder.id, { name: " " })).rejects.toBeInstanceOf(FileValidationError);
        await expect(r.updateItem(folder.id, { name: "../docs" })).rejects.toBeInstanceOf(FileValidationError);
        expect((await r.updateItem(folder.id, { name: " renamed " }))?.name).toBe("renamed");
        expect((await r.updateItem(folder.id, { parentId: null }))?.name).toBe("renamed");
    });

    test("reads and deletes pass straight through", async () => {
        const r = repo();
        const folder = await r.createFolder({ name: "a", parentId: null });
        expect((await r.listChildren(null)).total).toBe(1);
        expect((await r.getItem(folder.id))?.name).toBe("a");
        await r.deleteItem(folder.id);
        expect((await r.listChildren(null)).total).toBe(0);
    });
});

describe("validateUploadSize", () => {
    test("allows the exact upload limit and rejects one byte above it", () => {
        expect(() => validateUploadSize(MAX_UPLOAD_BYTES)).not.toThrow();
        expect(() => validateUploadSize(MAX_UPLOAD_BYTES + 1)).toThrow(FileValidationError);
    });
});
