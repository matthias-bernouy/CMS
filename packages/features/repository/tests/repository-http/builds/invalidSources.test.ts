import { expect, test } from "bun:test";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { encodePublicationUpload } from "repository/repository/publication/protocol";
import { compileCollectionSources } from "repository/exports/repository/authoring/build";
import { LocalCollectionRepository } from "repository/repository/filesystem/artifacts/collections";
import { FilesystemRepositorySourceStore } from "repository/repository/sources/filesystem";
import { sourceFixture } from "../../../../../../tests/fixtures/repository/sourceBuild";
import { ownerFixture, jsonRequest, assetRequest } from "../publicationFixtures";

test.each(["syntax", "null", "identity", "asset-set"])(
    "invalid source %s is a declared rejection without publication",
    async (invalidCase) => {
        const f = await sourceFixture();
        const root = join(f.root, "registry");
        const { application: app, owner } = await ownerFixture(root);
        try {
            const source = JSON.parse(f.sourceJson);
            const definition = source.files.find(({ path }: { path: string }) => path === "definition.json");
            if (invalidCase === "syntax") {
                definition.content = '{"kind":';
            }
            if (invalidCase === "null") {
                definition.content = "null";
            }
            if (invalidCase === "identity") {
                definition.content = JSON.stringify({ collectionId: "invalid" });
            }
            if (invalidCase === "asset-set") {
                source.assets[0].path = "assets/missing.txt";
            }
            const manifest = new TextDecoder().decode(
                encodePublicationUpload({
                    kind: "collection",
                    canonicalJson: f.admission.canonicalJson,
                    sourceJson: JSON.stringify(source),
                    assets: f.admission.release.assets.map(({ id, byteLength, digest }) => ({
                        id,
                        byteLength,
                        digest,
                    })),
                }),
            );
            const begin = await app.handle(
                jsonRequest("/v1/uploads", owner.token, { namespace: "publisher", namespaceRevision: 1, manifest }),
            );
            expect(begin.status).toBe(200);
            const { uploadId } = await begin.json();
            const scope = { namespace: "publisher", namespaceRevision: 1, uploadId };
            const asset = f.admission.release.assets[0]!;
            expect(
                (
                    await app.handle(
                        assetRequest(
                            `/v1/uploads/${uploadId}/assets/data.txt`,
                            owner.token,
                            "publisher",
                            new TextEncoder().encode("immutable source bytes"),
                            asset.digest,
                        ),
                    )
                ).status,
            ).toBe(204);
            const request = jsonRequest("/v1/uploads/build", owner.token, scope);
            request.headers.set("idempotency-key", `invalid:${invalidCase}`);
            const start = await app.handle(request);
            expect(start.status).toBe(202);
            const { operationId } = await start.json();
            await app.operations.stop();
            const response = await app.handle(
                jsonRequest("/v1/uploads/build-status", owner.token, { ...scope, operationId }, "QUERY"),
            );
            expect(response.status).toBe(200);
            expect(await response.json()).toMatchObject({ status: "failed", errorCode: "REJECTED" });
            expect(await new LocalCollectionRepository(root).listMetadata()).toHaveLength(0);
            expect(
                await new FilesystemRepositorySourceStore(root).get("publisher", "publisher/kit", "1.0.0"),
            ).toBeNull();
        } finally {
            await app.close();
            await f.close();
        }
    },
);

test("source size validation is a rejection but workspace IO failures remain technical errors", async () => {
    const f = await sourceFixture();
    try {
        await expect(
            compileCollectionSources(join(f.root, "limited"), f.sourceJson, [
                { id: "data.txt", bytes: new Blob([new Uint8Array(16 * 1024 * 1024 + 1)]) },
            ]),
        ).rejects.toMatchObject({ code: "REJECTED", message: expect.stringContaining("limit") });
        const unavailable = join(f.root, "not-a-directory");
        await writeFile(unavailable, "file");
        await expect(compileCollectionSources(unavailable, f.sourceJson, f.captured.assets)).rejects.toMatchObject({
            code: "EEXIST",
        });
    } finally {
        await f.close();
    }
});
