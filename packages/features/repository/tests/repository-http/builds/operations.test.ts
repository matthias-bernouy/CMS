import { expect, test } from "bun:test";
import { join } from "node:path";
import { encodePublicationUpload } from "repository/repository/publication/protocol";
import { FilesystemRepositoryPublicationRegistry } from "repository/repository/filesystem/mutations/publicationRegistry";
import { ownerFixture, jsonRequest, assetRequest } from "../publicationFixtures";
import { sourceFixture } from "../../../../../../tests/fixtures/repository/sourceBuild";
import { LocalCollectionRepository } from "repository/repository/filesystem/artifacts/collections";

test("durable builds return 202 and bind operation reads and retries to the exact actor and upload", async () => {
    const f = await sourceFixture();
    const root = join(f.root, "server");
    const registry = new FilesystemRepositoryPublicationRegistry(root);
    const { application, owner } = await ownerFixture(root, "publisher", registry);
    try {
        const stranger = await application.account("other-owner");
        const manifest = new TextDecoder().decode(
            encodePublicationUpload({
                kind: "collection",
                canonicalJson: f.admission.canonicalJson,
                sourceJson: f.sourceJson,
                assets: f.admission.release.assets.map(({ id, byteLength, digest }) => ({ id, byteLength, digest })),
            }),
        );
        const begin = await application.handle(
            jsonRequest("/v1/uploads", owner.token, { namespace: "publisher", namespaceRevision: 1, manifest }),
        );
        const { uploadId } = await begin.json();
        const scope = { namespace: "publisher", namespaceRevision: 1, uploadId };
        const asset = f.admission.release.assets[0]!;
        expect(
            (
                await application.handle(
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
        const start = (token: string, input = scope) => {
            const request = jsonRequest("/v1/uploads/build", token, input);
            request.headers.set("idempotency-key", `build:${uploadId}`);
            return application.handle(request);
        };
        expect((await start(stranger.token)).status).toBe(409);
        expect(await new LocalCollectionRepository(root).listMetadata()).toHaveLength(0);
        const accepted = await start(owner.token);
        expect(accepted.status).toBe(202);
        const { operationId } = await accepted.json();
        expect(typeof operationId).toBe("string");
        const status = (token: string, input = { ...scope, operationId }) =>
            application.handle(jsonRequest("/v1/uploads/build-status", token, input, "QUERY"));
        expect((await status(stranger.token)).status).toBe(409);
        expect((await status(owner.token, { ...scope, operationId: crypto.randomUUID() })).status).toBe(404);
        let output: { status: string; result?: unknown } = { status: "queued" };
        for (let attempt = 0; attempt < 100; attempt++) {
            const response = await status(owner.token);
            expect(response.status).toBe(200);
            output = await response.json();
            if (output.status === "succeeded" || output.status === "failed") {
                break;
            }
            await new Promise((resolve) => setTimeout(resolve, 5));
        }
        expect(output).toMatchObject({ status: "succeeded", result: { digest: f.admission.digest, added: true } });
        const replay = await start(owner.token);
        expect(replay.status).toBe(202);
        expect(await replay.json()).toEqual({ operationId });
        expect(await new LocalCollectionRepository(root).listMetadata()).toHaveLength(1);
    } finally {
        await application.close();
        await f.close();
    }
});
