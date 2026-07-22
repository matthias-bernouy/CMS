import { describe, test, expect, afterEach } from "bun:test";
import { serveFilesRequest, InMemoryCmsFilesMetadata, InMemoryCmsFilesBlob } from "@bernouy/cms-files";
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
        const blob = new InMemoryCmsFilesBlob();
        await seedFile(metadata, blob, {
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
        const blob = new InMemoryCmsFilesBlob();
        await seedFile(metadata, blob, {
            folder: "logos",
            name: "hero.png",
            mimeType: "image/png",
            bytes: encode.encode("X"),
        });

        const res = await serveFilesRequest(
            { metadata, blob },
            filesRequest(`${FILES_PREFIX}logos/hero.png?v=abc1234567`),
            {
                prefix: FILES_PREFIX,
            },
        );
        expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
        // `?v` is a cache token only — it must not affect path resolution.
        expect(res.status).toBe(200);
        expect(await res.text()).toBe("X");
    });

    test("prod + unversioned URL → revalidate (no immutable cache)", async () => {
        process.env.MODE = "PROD";
        const metadata = new InMemoryCmsFilesMetadata();
        const blob = new InMemoryCmsFilesBlob();
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
        const blob = new InMemoryCmsFilesBlob();
        await seedFile(metadata, blob, {
            folder: "logos",
            name: "hero.png",
            mimeType: "image/png",
            bytes: encode.encode("X"),
        });

        const res = await serveFilesRequest(
            { metadata, blob },
            filesRequest(`${FILES_PREFIX}logos/hero.png?v=abc1234567`),
            {
                prefix: FILES_PREFIX,
            },
        );
        expect(res.headers.get("Cache-Control")).toBe("no-cache, must-revalidate");
    });

    test("an off-allow-list type is sent as an opaque attachment", async () => {
        process.env.MODE = "PROD";
        const metadata = new InMemoryCmsFilesMetadata();
        const blob = new InMemoryCmsFilesBlob();
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
        const blob = new InMemoryCmsFilesBlob();
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
