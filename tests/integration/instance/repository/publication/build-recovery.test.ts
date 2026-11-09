import { expect, test } from "bun:test";
import { join } from "node:path";
import {
    MemoryProviderOperationStore,
    ProviderOperationExecutor,
    createRepositoryOperationQueries,
} from "@bernouy/ulvia-provider";
import { repositoryApplication } from "../../../../fixtures/repository/application";
import { repositoryFixtureHttp } from "../../../../fixtures/repository/http";
import { encodePublicationUpload } from "@bernouy/repository/repository/publication";
import { LocalCollectionRepository } from "@bernouy/repository/repository/filesystem";
import {
    jsonRequest,
    assetRequest,
} from "../../../../../packages/features/repository/tests/repository-http/publicationFixtures";
import { sourceFixture } from "../../../../fixtures/repository/sourceBuild";

class HeldStore extends MemoryProviderOperationStore {
    held = true;
    override async claim(...args: Parameters<MemoryProviderOperationStore["claim"]>) {
        return this.held ? false : super.claim(...args);
    }
}

test.each([false, true])("recovered publication rechecks current ownership (transferred: %s)", async (transfer) => {
    const f = await sourceFixture();
    const root = join(f.root, "server");
    const store = new HeldStore();
    const app = repositoryApplication(root, "recovery-fixture", undefined, store);
    let recovered: ProviderOperationExecutor | undefined;
    try {
        const owner = await app.account();
        const successor = await app.account("successor");
        await app.namespaces.claim(owner.accountId, "publisher");
        const manifest = new TextDecoder().decode(
            encodePublicationUpload({
                kind: "collection",
                canonicalJson: f.admission.canonicalJson,
                sourceJson: f.sourceJson,
                assets: f.admission.release.assets.map(({ id, byteLength, digest }) => ({ id, byteLength, digest })),
            }),
        );
        const started = await app.handle(
            jsonRequest("/v1/uploads", owner.token, { namespace: "publisher", namespaceRevision: 1, manifest }),
        );
        const { uploadId } = await started.json();
        const asset = f.admission.release.assets[0]!;
        await app.handle(
            assetRequest(
                `/v1/uploads/${uploadId}/assets/data.txt`,
                owner.token,
                "publisher",
                new TextEncoder().encode("immutable source bytes"),
                asset.digest,
            ),
        );
        const scope = { uploadId, namespace: "publisher", namespaceRevision: 1 };
        const request = jsonRequest("/v1/uploads/build", owner.token, scope);
        request.headers.set("idempotency-key", `recovery:${uploadId}`);
        const response = await app.handle(request);
        expect(response.status).toBe(202);
        const { operationId } = await response.json();
        await app.operations.stop();
        expect((await store.get("fixture", operationId))?.status).toBe("queued");
        const query = createRepositoryOperationQueries(app.operations);
        const actor = { providerId: "ulvia/fixture.repository", subjectId: owner.accountId };
        await expect(query.get("other-instance", { ...scope, operationId }, actor)).rejects.toMatchObject({
            code: "NOT_FOUND",
        });
        await expect(
            query.get("fixture", { ...scope, operationId }, { ...actor, subjectId: successor.accountId }),
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
        if (transfer) {
            await app.namespaces.transfer(owner.accountId, "publisher", 1, successor.accountId);
        }
        store.held = false;
        recovered = new ProviderOperationExecutor(store);
        await repositoryFixtureHttp(app.service, async () => owner.accountId, recovered);
        await recovered.recover();
        const terminal = await store.get("fixture", operationId);
        expect(terminal?.status).toBe(transfer ? "failed" : "succeeded");
        expect(await new LocalCollectionRepository(root).listMetadata()).toHaveLength(transfer ? 0 : 1);
        if (transfer) {
            expect(terminal?.errorCode).toBe("REJECTED");
        }
    } finally {
        await recovered?.stop();
        await app.close();
        await f.close();
    }
});
