import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";
import DeliveryCms from "cms-delivery/DeliveryCms";
import { CaptureRunner } from "./support/CaptureRunner";
import {
    PUBLISHED_PAGE_SNAPSHOT_ROUTE,
    publishedPageSnapshotUrl,
    serializePublishedPageSnapshot,
    servePublishedPageSnapshot,
    type ContentReader,
    type TPage,
} from "@bernouy/cms-content";

const published: TPage = {
    id: "page-legal",
    path: "/terms",
    title: "Terms",
    description: "Terms of sale",
    content: "<h1>Terms</h1><p>Version one.</p>",
    visible: true,
    tags: ["legal"],
};

describe("published page snapshot", () => {
    test("is mounted on the public Delivery surface", async () => {
        const runner = new CaptureRunner();
        new DeliveryCms({ runner, repository: repositoryWith(published) });
        const handler = runner.endpointHandler("GET", PUBLISHED_PAGE_SNAPSHOT_ROUTE);
        const response = await handler(snapshotRequest(published.id), {} as never);
        expect(response.status).toBe(200);
    });

    test("returns a canonical server-side snapshot for a published page", async () => {
        const repository = repositoryWith(published);
        const response = await request(repository, published.id);

        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(response.headers.get("x-content-type-options")).toBe("nosniff");
        const body = await response.json();
        const snapshot = {
            id: published.id,
            path: published.path,
            title: published.title,
            description: published.description,
            content: published.content,
        };
        expect(body).toEqual({
            schema: "cms-published-page-snapshot-v1",
            page: snapshot,
            contentHash: createHash("sha256").update(serializePublishedPageSnapshot(snapshot)).digest("hex"),
        });
        expect(body.page).not.toHaveProperty("visible");
        expect(body.page).not.toHaveProperty("tags");
    });

    test("does not expose a draft or a missing page", async () => {
        const repository = repositoryWith({ ...published, visible: false });
        expect((await request(repository, published.id)).status).toBe(404);
        expect((await request(repository, "missing")).status).toBe(404);
    });

    test("requires a server-selected page id", async () => {
        const repository = repositoryWith(published);
        const response = await servePublishedPageSnapshot(
            repository,
            new Request(`https://site.test${PUBLISHED_PAGE_SNAPSHOT_ROUTE}`),
        );
        expect(response.status).toBe(400);
    });

    test("builds a snapshot URL without losing a tenant base path", () => {
        expect(publishedPageSnapshotUrl("https://cms.test/tenant/", "page-legal")).toBe(
            `https://cms.test/tenant${PUBLISHED_PAGE_SNAPSHOT_ROUTE}?id=page-legal`,
        );
    });

    test("rejects an oversized public page id before querying storage", async () => {
        const response = await request(repositoryWith(published), "x".repeat(513));
        expect(response.status).toBe(400);
    });

    test("changes the hash when published legal content changes", async () => {
        const first = await request(repositoryWith(published), published.id);
        const firstHash = (await first.json()).contentHash;
        const second = await request(
            repositoryWith({ ...published, content: "<h1>Terms</h1><p>Version two.</p>" }),
            published.id,
        );
        expect((await second.json()).contentHash).not.toBe(firstHash);
    });

    test("keeps resolving the same page id after a path change", async () => {
        const response = await request(repositoryWith({ ...published, path: "/new-terms" }), published.id);
        expect((await response.json()).page.path).toBe("/new-terms");
    });
});

function repositoryWith(page: TPage): ContentReader {
    return {
        getPageById: async (id: string) => (id === page.id ? structuredClone(page) : null),
    } as ContentReader;
}

function request(repository: ContentReader, pageId: string): Promise<Response> {
    return servePublishedPageSnapshot(repository, snapshotRequest(pageId));
}

function snapshotRequest(pageId: string): Request {
    const url = new URL(`https://site.test${PUBLISHED_PAGE_SNAPSHOT_ROUTE}`);
    url.searchParams.set("id", pageId);
    return new Request(url);
}
