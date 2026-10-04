import { describe, test, expect, afterEach } from "bun:test";
import { MemoryBlobStore } from "@bernouy/blob-store/memory";
import { serveFilesRequest } from "@bernouy/cms-content/files/serving";
import { InMemoryCmsFilesMetadata } from "@bernouy/cms-content/files";
import { encode, FILES_PREFIX, filesRequest, seedFile } from "./serveFilesFixtures";

// Each test pins MODE explicitly; restore afterwards so tests don't leak state.
const savedMode = process.env.MODE;
afterEach(() => {
    if (savedMode === undefined) {
        delete process.env.MODE;
    } else {
        process.env.MODE = savedMode;
    }
});

describe("serveFilesRequest", () => {
    test("serves an inline-safe file with the security headers", async () => {
        process.env.MODE = "PROD";
        const metadata = new InMemoryCmsFilesMetadata();
        const blob = new MemoryBlobStore();
        const { fileId } = await seedFile(metadata, blob, {
            folder: "logos",
            name: "hero.png",
            mimeType: "image/png",
            bytes: encode.encode("PNG"),
        });

        const res = await serveFilesRequest({ metadata, blob }, filesRequest(`${FILES_PREFIX}logos/hero.png`), {
            prefix: FILES_PREFIX,
        });
        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Type")).toBe("image/png");
        expect(res.headers.get("Content-Disposition")).toBe("inline");
        expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
        expect(await res.text()).toBe("PNG");
    });

    test("prod + versioned URL (?v=hash) → long immutable cache", async () => {
        process.env.MODE = "PROD";
        const metadata = new InMemoryCmsFilesMetadata();
        const blob = new MemoryBlobStore();
        const { fileId } = await seedFile(metadata, blob, {
            folder: "logos",
            name: "hero.png",
            mimeType: "image/png",
            bytes: encode.encode("X"),
        });
        await metadata.updateFileContent(fileId, {
            size: 1,
            mimeType: "image/png",
            contentHash: "a".repeat(64),
        });
        const item = await metadata.getItem(fileId);
        const version = item?.type === "file" ? item.representationVersion : undefined;

        const res = await serveFilesRequest(
            { metadata, blob },
            filesRequest(`${FILES_PREFIX}logos/hero.png?v=${version}`),
            {
                prefix: FILES_PREFIX,
            },
        );
        expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
        // A matching representation fingerprint enables immutable caching.
        expect(res.status).toBe(200);
        expect(await res.text()).toBe("X");
    });

    test("prod + unversioned URL → revalidate (no immutable cache)", async () => {
        process.env.MODE = "PROD";
        const metadata = new InMemoryCmsFilesMetadata();
        const blob = new MemoryBlobStore();
        await seedFile(metadata, blob, {
            folder: "logos",
            name: "hero.png",
            mimeType: "image/png",
            bytes: encode.encode("X"),
        });
        const res = await serveFilesRequest({ metadata, blob }, filesRequest(`${FILES_PREFIX}logos/hero.png`), {
            prefix: FILES_PREFIX,
        });
        expect(res.headers.get("Cache-Control")).toBe("no-cache, must-revalidate");
    });

    test("DEV never serves an immutable cache, even when versioned", async () => {
        process.env.MODE = "DEV";
        const metadata = new InMemoryCmsFilesMetadata();
        const blob = new MemoryBlobStore();
        const { fileId } = await seedFile(metadata, blob, {
            folder: "logos",
            name: "hero.png",
            mimeType: "image/png",
            bytes: encode.encode("X"),
        });
        await metadata.updateFileContent(fileId, {
            size: 1,
            mimeType: "image/png",
            contentHash: "b".repeat(64),
        });
        const item = await metadata.getItem(fileId);
        const version = item?.type === "file" ? item.representationVersion : undefined;

        const res = await serveFilesRequest(
            { metadata, blob },
            filesRequest(`${FILES_PREFIX}logos/hero.png?v=${version}`),
            {
                prefix: FILES_PREFIX,
            },
        );
        expect(res.headers.get("Cache-Control")).toBe("no-cache, must-revalidate");
    });

    test("an off-allow-list type is sent as an opaque attachment", async () => {
        process.env.MODE = "PROD";
        const metadata = new InMemoryCmsFilesMetadata();
        const blob = new MemoryBlobStore();
        await seedFile(metadata, blob, {
            folder: "docs",
            name: "evil.svg",
            mimeType: "image/svg+xml",
            bytes: encode.encode("<svg/>"),
        });

        const res = await serveFilesRequest({ metadata, blob }, filesRequest(`${FILES_PREFIX}docs/evil.svg`), {
            prefix: FILES_PREFIX,
        });
        expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
        expect(res.headers.get("Content-Disposition")).toBe("attachment");
    });

    test("404 for a missing path and for `..` traversal", async () => {
        const metadata = new InMemoryCmsFilesMetadata();
        const blob = new MemoryBlobStore();
        expect(
            (
                await serveFilesRequest({ metadata, blob }, filesRequest(`${FILES_PREFIX}nope/x.png`), {
                    prefix: FILES_PREFIX,
                })
            ).status,
        ).toBe(404);
        expect(
            (
                await serveFilesRequest({ metadata, blob }, filesRequest(`${FILES_PREFIX}../secret`), {
                    prefix: FILES_PREFIX,
                })
            ).status,
        ).toBe(404);
    });
});
