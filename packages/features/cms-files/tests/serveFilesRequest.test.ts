import { describe, test, expect, afterEach } from "bun:test";
import { serveFilesRequest, InMemoryCmsFilesMetadata, InMemoryCmsFilesBlob } from "@bernouy/cms-files";

const PREFIX = "/.cms/files/";
const enc = new TextEncoder();

async function seed(
    metadata: InMemoryCmsFilesMetadata,
    blob: InMemoryCmsFilesBlob,
    opts: { folder: string; name: string; mimeType: string; bytes: Uint8Array },
): Promise<{ folderId: string; fileId: string }> {
    const folder = await metadata.createFolder({ name: opts.folder, parentId: null });
    const file = await metadata.createFile({
        name: opts.name,
        parentId: folder.id,
        size: opts.bytes.byteLength,
        mimeType: opts.mimeType,
    });
    await blob.put(file.id, opts.bytes);
    return { folderId: folder.id, fileId: file.id };
}

const req = (path: string) => new Request(`http://x${path}`);

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
        const blob = new InMemoryCmsFilesBlob();
        await seed(metadata, blob, {
            folder: "logos",
            name: "hero.png",
            mimeType: "image/png",
            bytes: enc.encode("PNG"),
        });

        const res = await serveFilesRequest({ metadata, blob }, req(`${PREFIX}logos/hero.png`), { prefix: PREFIX });
        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Type")).toBe("image/png");
        expect(res.headers.get("Content-Disposition")).toBe("inline");
        expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
        expect(await res.text()).toBe("PNG");
    });

    test("prod + versioned URL (?v=hash) → long immutable cache", async () => {
        process.env.MODE = "PROD";
        const metadata = new InMemoryCmsFilesMetadata();
        const blob = new InMemoryCmsFilesBlob();
        await seed(metadata, blob, {
            folder: "logos",
            name: "hero.png",
            mimeType: "image/png",
            bytes: enc.encode("X"),
        });

        const res = await serveFilesRequest({ metadata, blob }, req(`${PREFIX}logos/hero.png?v=abc1234567`), {
            prefix: PREFIX,
        });
        expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
        // `?v` is a cache token only — it must not affect path resolution.
        expect(res.status).toBe(200);
        expect(await res.text()).toBe("X");
    });

    test("prod + unversioned URL → revalidate (no immutable cache)", async () => {
        process.env.MODE = "PROD";
        const metadata = new InMemoryCmsFilesMetadata();
        const blob = new InMemoryCmsFilesBlob();
        await seed(metadata, blob, {
            folder: "logos",
            name: "hero.png",
            mimeType: "image/png",
            bytes: enc.encode("X"),
        });

        const res = await serveFilesRequest({ metadata, blob }, req(`${PREFIX}logos/hero.png`), { prefix: PREFIX });
        expect(res.headers.get("Cache-Control")).toBe("no-cache, must-revalidate");
    });

    test("DEV never serves an immutable cache, even when versioned", async () => {
        process.env.MODE = "DEV";
        const metadata = new InMemoryCmsFilesMetadata();
        const blob = new InMemoryCmsFilesBlob();
        await seed(metadata, blob, {
            folder: "logos",
            name: "hero.png",
            mimeType: "image/png",
            bytes: enc.encode("X"),
        });

        const res = await serveFilesRequest({ metadata, blob }, req(`${PREFIX}logos/hero.png?v=abc1234567`), {
            prefix: PREFIX,
        });
        expect(res.headers.get("Cache-Control")).toBe("no-cache, must-revalidate");
    });

    test("an off-allow-list type is sent as an opaque attachment", async () => {
        process.env.MODE = "PROD";
        const metadata = new InMemoryCmsFilesMetadata();
        const blob = new InMemoryCmsFilesBlob();
        await seed(metadata, blob, {
            folder: "docs",
            name: "evil.svg",
            mimeType: "image/svg+xml",
            bytes: enc.encode("<svg/>"),
        });

        const res = await serveFilesRequest({ metadata, blob }, req(`${PREFIX}docs/evil.svg`), { prefix: PREFIX });
        expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
        expect(res.headers.get("Content-Disposition")).toBe("attachment");
    });

    test("404 for a missing path and for `..` traversal", async () => {
        const metadata = new InMemoryCmsFilesMetadata();
        const blob = new InMemoryCmsFilesBlob();
        expect(
            (await serveFilesRequest({ metadata, blob }, req(`${PREFIX}nope/x.png`), { prefix: PREFIX })).status,
        ).toBe(404);
        expect(
            (await serveFilesRequest({ metadata, blob }, req(`${PREFIX}../secret`), { prefix: PREFIX })).status,
        ).toBe(404);
    });

    describe("by-id route", () => {
        test("streams the bytes immutable in prod (no `?v` needed)", async () => {
            process.env.MODE = "PROD";
            const metadata = new InMemoryCmsFilesMetadata();
            const blob = new InMemoryCmsFilesBlob();
            const { fileId } = await seed(metadata, blob, {
                folder: "logos",
                name: "hero.png",
                mimeType: "image/png",
                bytes: enc.encode("PNG"),
            });

            const res = await serveFilesRequest({ metadata, blob }, req(`${PREFIX}by-id/${fileId}`), {
                prefix: PREFIX,
            });
            expect(res.status).toBe(200);
            expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
            expect(res.headers.get("Content-Type")).toBe("image/png");
            expect(await res.text()).toBe("PNG");
        });

        test("in DEV the id route revalidates (you edit files on disk; nothing is cached)", async () => {
            process.env.MODE = "DEV";
            const metadata = new InMemoryCmsFilesMetadata();
            const blob = new InMemoryCmsFilesBlob();
            const { fileId } = await seed(metadata, blob, {
                folder: "logos",
                name: "hero.png",
                mimeType: "image/png",
                bytes: enc.encode("PNG"),
            });

            const res = await serveFilesRequest({ metadata, blob }, req(`${PREFIX}by-id/${fileId}`), {
                prefix: PREFIX,
            });
            expect(res.headers.get("Cache-Control")).toBe("no-cache, must-revalidate");
        });

        test("an unknown id → 404", async () => {
            const metadata = new InMemoryCmsFilesMetadata();
            const blob = new InMemoryCmsFilesBlob();
            const res = await serveFilesRequest({ metadata, blob }, req(`${PREFIX}by-id/does-not-exist`), {
                prefix: PREFIX,
            });
            expect(res.status).toBe(404);
        });

        test("a folder id → 404 (only files are servable)", async () => {
            const metadata = new InMemoryCmsFilesMetadata();
            const blob = new InMemoryCmsFilesBlob();
            const { folderId } = await seed(metadata, blob, {
                folder: "logos",
                name: "hero.png",
                mimeType: "image/png",
                bytes: enc.encode("X"),
            });
            const res = await serveFilesRequest({ metadata, blob }, req(`${PREFIX}by-id/${folderId}`), {
                prefix: PREFIX,
            });
            expect(res.status).toBe(404);
        });

        test("a non-inline-safe type (svg) is still sent as an attachment", async () => {
            const metadata = new InMemoryCmsFilesMetadata();
            const blob = new InMemoryCmsFilesBlob();
            const { fileId } = await seed(metadata, blob, {
                folder: "docs",
                name: "x.svg",
                mimeType: "image/svg+xml",
                bytes: enc.encode("<svg/>"),
            });
            const res = await serveFilesRequest({ metadata, blob }, req(`${PREFIX}by-id/${fileId}`), {
                prefix: PREFIX,
            });
            expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
            expect(res.headers.get("Content-Disposition")).toBe("attachment");
        });
    });
});
