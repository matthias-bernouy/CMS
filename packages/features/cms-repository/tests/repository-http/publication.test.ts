import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { encodePublicationUpload, parsePublicationUpload } from "@bernouy/cms-repository/repository/publication";
import { jsonRequest, assetRequest, RecordingRegistry, ownerFixture } from "./publicationFixtures";

const directories: string[] = [];

test("publication metadata carries expanded collection documents and asset indexes", () => {
    const canonicalJson = JSON.stringify({ value: "x".repeat(3 * 1024 * 1024) });
    const assets = Array.from({ length: 257 }, (_, index) => ({
        id: index === 0 ? "icons/search.svg" : `asset-${index}`,
        byteLength: 0,
        digest: `sha256:${"0".repeat(64)}` as const,
    }));
    expect(parsePublicationUpload(encodePublicationUpload({ kind: "collection", canonicalJson, assets }))).toEqual({
        kind: "collection",
        canonicalJson,
        assets,
    });
});

afterEach(async () => {
    await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

test("revoking a shared CMS PAT prevents the next protected stage without publishing", async () => {
    const root = await temporaryDirectory();
    const registry = new RecordingRegistry();
    const { application, owner } = await ownerFixture(root, "publisher", registry);
    try {
        const manifest = new TextDecoder().decode(
            encodePublicationUpload({
                kind: "provider-manifest",
                canonicalJson: '{"provenance":{"publisherId":"publisher"}}',
                assets: [],
            }),
        );
        const input = { namespace: "publisher", namespaceRevision: 1, manifest };
        const created = await application.handle(jsonRequest("/v1/uploads", owner.token, input));
        expect(created.status).toBe(200);
        const { uploadId } = await created.json();
        await application.pats.revoke(owner.accountId, owner.patId);
        const commit = { namespace: "publisher", namespaceRevision: 1, uploadId };
        expect((await application.handle(jsonRequest("/v1/uploads/commit", owner.token, commit))).status).toBe(401);
        expect(registry.publications).toHaveLength(0);
        const replacement = await application.account(owner.accountId);
        expect((await application.handle(jsonRequest("/v1/uploads/commit", replacement.token, commit))).status).toBe(
            200,
        );
        expect(registry.publications).toHaveLength(1);
    } finally {
        await application.close();
    }
});

test("assets remain invisible until every streamed byte is verified and committed", async () => {
    const root = await temporaryDirectory();
    const registry = new RecordingRegistry();
    const { application, owner } = await ownerFixture(root, "publisher", registry);
    try {
        const expected = Buffer.from("verified asset");
        const digest = `sha256:${createHash("sha256").update(expected).digest("hex")}` as const;
        const manifest = new TextDecoder().decode(
            encodePublicationUpload({
                kind: "contract",
                canonicalJson: '{"publisherId":"publisher"}',
                assets: [{ id: "fixture.txt", byteLength: expected.byteLength, digest }],
            }),
        );
        const input = { namespace: "publisher", namespaceRevision: 1, manifest };
        const created = await application.handle(jsonRequest("/v1/uploads", owner.token, input));
        expect(created.status).toBe(200);
        const { uploadId } = await created.json();
        const scope = { namespace: "publisher", namespaceRevision: 1, uploadId };
        const commit = () => application.handle(jsonRequest("/v1/uploads/commit", owner.token, scope));
        expect((await commit()).status).toBe(409);
        expect(registry.publications).toHaveLength(0);
        const path = `/v1/uploads/${uploadId}/assets/fixture.txt`;
        expect(
            (
                await application.handle(
                    assetRequest(path, owner.token, "publisher", Buffer.from("tampered asset"), digest),
                )
            ).status,
        ).toBe(409);
        expect((await application.handle(assetRequest(path, owner.token, "publisher", expected, digest))).status).toBe(
            204,
        );
        const status = await application.handle(jsonRequest("/v1/uploads/status", owner.token, scope, "QUERY"));
        expect(await status.json()).toMatchObject({ uploadId, uploadedAssetIds: ["fixture.txt"] });
        const resumed = await application.handle(jsonRequest("/v1/uploads", owner.token, input));
        expect(await resumed.json()).toMatchObject({ uploadId, uploadedAssetIds: ["fixture.txt"] });
        expect((await commit()).status).toBe(200);
        expect(registry.publications).toHaveLength(1);
        const published = registry.publications[0]!.assets[0]!.bytes;
        expect(published instanceof Blob ? await published.text() : new TextDecoder().decode(published)).toBe(
            "verified asset",
        );
        expect((await commit()).status).toBe(200);
        expect(registry.publications).toHaveLength(1);
    } finally {
        await application.close();
    }
});

test("large publication manifests retain the existing metadata budget outside the general JSON envelope", async () => {
    const root = await temporaryDirectory();
    const registry = new RecordingRegistry();
    const { application, owner } = await ownerFixture(root, "publisher", registry);
    try {
        const canonicalJson = JSON.stringify({ publisherId: "publisher", content: "x".repeat(3 * 1024 * 1024) });
        const manifest = new TextDecoder().decode(
            encodePublicationUpload({ kind: "contract", canonicalJson, assets: [] }),
        );
        const response = await application.handle(
            jsonRequest("/v1/uploads", owner.token, { namespace: "publisher", namespaceRevision: 1, manifest }),
        );
        expect(response.status).toBe(200);
        const { uploadId } = await response.json();
        expect(
            (
                await application.handle(
                    jsonRequest("/v1/uploads/commit", owner.token, {
                        namespace: "publisher",
                        namespaceRevision: 1,
                        uploadId,
                    }),
                )
            ).status,
        ).toBe(200);
        expect(registry.publications[0]!.canonicalJson).toBe(canonicalJson);
    } finally {
        await application.close();
    }
});

async function temporaryDirectory(): Promise<string> {
    const path = await mkdtemp(join(tmpdir(), "repository-publication-"));
    directories.push(path);
    return path;
}
