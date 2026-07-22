import { afterEach, describe, expect, test } from "bun:test";
import { InMemoryCmsFilesBlob, InMemoryCmsFilesMetadata, serveFilesRequest } from "@bernouy/cms-files";
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
    test("streams the bytes immutable in prod without a version query", async () => {
        process.env.MODE = "PROD";
        const metadata = new InMemoryCmsFilesMetadata();
        const blob = new InMemoryCmsFilesBlob();
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
        expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
        expect(response.headers.get("Content-Type")).toBe("image/png");
        expect(await response.text()).toBe("PNG");
    });

    test("revalidates the id route in development", async () => {
        process.env.MODE = "DEV";
        const metadata = new InMemoryCmsFilesMetadata();
        const blob = new InMemoryCmsFilesBlob();
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
        const blob = new InMemoryCmsFilesBlob();
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
    });

    test("serves a non-inline-safe type as an attachment", async () => {
        const metadata = new InMemoryCmsFilesMetadata();
        const blob = new InMemoryCmsFilesBlob();
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
