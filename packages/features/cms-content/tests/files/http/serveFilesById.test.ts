import { afterEach, describe, expect, test } from "bun:test";
import { MemoryBlobStore } from "@bernouy/blob-store/memory";
import { InMemoryCmsFilesMetadata } from "@bernouy/cms-content/files";
import { serveFilesRequest } from "@bernouy/cms-content/files/serving";
import { encode, FILES_PREFIX, filesRequest, seedFile } from "./serveFilesFixtures";

const savedMode = process.env.MODE;
afterEach(() => {
    if (savedMode === undefined) {
        delete process.env.MODE;
    } else {
        process.env.MODE = savedMode;
    }
});

describe("serveFilesRequest by-id route", () => {
    test("revalidates mutable id URLs without a version query", async () => {
        process.env.MODE = "PROD";
        const metadata = new InMemoryCmsFilesMetadata();
        const blob = new MemoryBlobStore();
        const { fileId } = await seedFile(metadata, blob, {
            folder: "logos",
            name: "hero.png",
            mimeType: "image/png",
            bytes: encode.encode("PNG"),
        });
        const response = await serveFilesRequest({ metadata, blob }, filesRequest(`${FILES_PREFIX}by-id/${fileId}`), {
            prefix: FILES_PREFIX,
        });
        expect(response.status).toBe(200);
        expect(response.headers.get("Cache-Control")).toBe("no-cache, must-revalidate");
        expect(response.headers.get("Content-Type")).toBe("image/png");
        expect(await response.text()).toBe("PNG");
        const inventedVersion = await serveFilesRequest(
            { metadata, blob },
            filesRequest(`${FILES_PREFIX}by-id/${fileId}?v=not-a-real-version`),
            { prefix: FILES_PREFIX },
        );
        expect(inventedVersion.status).toBe(404);
    });

    test("serves versioned id URLs immutably and supports byte ranges", async () => {
        process.env.MODE = "PROD";
        const metadata = new InMemoryCmsFilesMetadata();
        const blob = new MemoryBlobStore();
        const { fileId } = await seedFile(metadata, blob, {
            folder: "logos",
            name: "hero.png",
            mimeType: "image/png",
            bytes: encode.encode("PNGDATA"),
        });
        await metadata.updateFileContent(fileId, {
            size: 7,
            mimeType: "image/png",
            contentHash: "a".repeat(64),
        });
        const item = await metadata.getItem(fileId);
        const version = item?.type === "file" ? item.representationVersion : undefined;
        const response = await serveFilesRequest(
            { metadata, blob },
            filesRequest(`${FILES_PREFIX}by-id/${fileId}?v=${version}`, { headers: { range: "bytes=1-3" } }),
            { prefix: FILES_PREFIX },
        );
        expect(response.status).toBe(206);
        expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
        expect(response.headers.get("Content-Range")).toBe("bytes 1-3/7");
        expect(await response.text()).toBe("NGD");
        const revalidated = await serveFilesRequest(
            { metadata, blob },
            filesRequest(`${FILES_PREFIX}by-id/${fileId}?v=${version}`, {
                headers: { "if-none-match": `W/${response.headers.get("etag")}` },
            }),
            { prefix: FILES_PREFIX },
        );
        expect(revalidated.status).toBe(304);
        expect(revalidated.headers.get("content-length")).toBeNull();
    });

    test("revalidates the id route in development", async () => {
        process.env.MODE = "DEV";
        const metadata = new InMemoryCmsFilesMetadata();
        const blob = new MemoryBlobStore();
        const { fileId } = await seedFile(metadata, blob, {
            folder: "logos",
            name: "hero.png",
            mimeType: "image/png",
            bytes: encode.encode("PNG"),
        });
        const response = await serveFilesRequest({ metadata, blob }, filesRequest(`${FILES_PREFIX}by-id/${fileId}`), {
            prefix: FILES_PREFIX,
        });
        expect(response.headers.get("Cache-Control")).toBe("no-cache, must-revalidate");
    });

    test("returns 404 for unknown and folder ids", async () => {
        const metadata = new InMemoryCmsFilesMetadata();
        const blob = new MemoryBlobStore();
        const unknown = await serveFilesRequest(
            { metadata, blob },
            filesRequest(`${FILES_PREFIX}by-id/does-not-exist`),
            { prefix: FILES_PREFIX },
        );
        expect(unknown.status).toBe(404);
        const { folderId } = await seedFile(metadata, blob, {
            folder: "logos",
            name: "hero.png",
            mimeType: "image/png",
            bytes: encode.encode("X"),
        });
        const folder = await serveFilesRequest({ metadata, blob }, filesRequest(`${FILES_PREFIX}by-id/${folderId}`), {
            prefix: FILES_PREFIX,
        });
        expect(folder.status).toBe(404);
        const orphan = await metadata.createFile({
            name: "orphan.txt",
            parentId: null,
            size: 4,
            mimeType: "text/plain",
        });
        const missingHead = await serveFilesRequest(
            { metadata, blob },
            filesRequest(`${FILES_PREFIX}by-id/${orphan.id}`, { method: "HEAD" }),
            { prefix: FILES_PREFIX },
        );
        expect(missingHead.status).toBe(404);
    });

    test("serves a non-inline-safe type as an attachment", async () => {
        const metadata = new InMemoryCmsFilesMetadata();
        const blob = new MemoryBlobStore();
        const { fileId } = await seedFile(metadata, blob, {
            folder: "docs",
            name: "x.svg",
            mimeType: "image/svg+xml",
            bytes: encode.encode("<svg/>"),
        });
        const response = await serveFilesRequest({ metadata, blob }, filesRequest(`${FILES_PREFIX}by-id/${fileId}`), {
            prefix: FILES_PREFIX,
        });
        expect(response.headers.get("Content-Type")).toBe("application/octet-stream");
        expect(response.headers.get("Content-Disposition")).toBe("attachment");
    });
});
