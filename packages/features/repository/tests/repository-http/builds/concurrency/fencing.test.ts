import { buildCollectionBundle } from "repository/repository/filesystem/builds/collections";
import { InMemoryReleaseCatalogue } from "repository/contracts/default-implementation/memory/InMemoryReleaseCatalogue";
import { expect, test } from "bun:test";
import { join } from "node:path";
import { FilesystemRepositoryPublicationRegistry } from "repository/repository/filesystem/mutations/publicationRegistry";
import type { PublicationEnvelope, RepositoryPublicationResult } from "repository/repository/publication/types";
import { LocalCollectionRepository } from "repository/repository/filesystem/artifacts/collections";
import { FilesystemRepositorySourceStore } from "repository/repository/sources/filesystem";
import { encodePublicationUpload } from "repository/repository/publication/protocol";
import { sourceFixture } from "../../../../../../../tests/fixtures/repository/sourceBuild";
import { ownerFixture } from "../../publicationFixtures";

class PausedRegistry extends FilesystemRepositoryPublicationRegistry {
    ready = Promise.withResolvers<void>();
    continue = Promise.withResolvers<void>();
    override buildCollection(
        envelope: PublicationEnvelope,
        finalize: (publish: () => Promise<RepositoryPublicationResult>) => Promise<RepositoryPublicationResult>,
        signal?: AbortSignal,
    ) {
        return super.buildCollection(
            envelope,
            async (publish) => {
                this.ready.resolve();
                await this.continue.promise;
                return finalize(publish);
            },
            signal,
        );
    }
}

test.each(["transfer", "lease"])(
    "status remains available and %s during a build refuses final publication",
    async (failure) => {
        const f = await sourceFixture();
        const root = join(f.root, "server");
        const registry = new PausedRegistry(root);
        const { application: app, owner } = await ownerFixture(root, "publisher", registry);
        let running: Promise<unknown> | undefined;
        const controller = new AbortController();
        try {
            const successor = await app.account("successor");
            const bytes = encodePublicationUpload({
                kind: "collection",
                canonicalJson: f.admission.canonicalJson,
                sourceJson: f.sourceJson,
                assets: f.admission.release.assets.map(({ id, byteLength, digest }) => ({ id, byteLength, digest })),
            });
            const scope = { namespace: "publisher", namespaceRevision: 1 };
            const upload = await app.service.publications.begin(scope, owner.accountId, {
                stream: new Blob([bytes]).stream(),
            });
            const input = { ...scope, uploadId: upload.uploadId };
            const asset = f.admission.release.assets[0]!;
            await app.service.publications.asset(
                { ...input, assetId: asset.id, contentDigest: asset.digest },
                owner.accountId,
                { stream: f.admission.assets[0]!.bytes.stream() },
            );
            running = app.service.publications.build(input, owner.accountId, controller.signal);
            void running.catch(() => undefined);
            await registry.ready.promise;
            let timer: ReturnType<typeof setTimeout> | undefined;
            try {
                expect(
                    await Promise.race([
                        app.service.publications.authorize(input, owner.accountId),
                        new Promise((_, reject) => {
                            timer = setTimeout(() => reject(new Error("status blocked by compilation")), 500);
                        }),
                    ]),
                ).toBeNull();
            } finally {
                clearTimeout(timer);
            }
            if (failure === "transfer") {
                await app.namespaces.transfer(owner.accountId, "publisher", 1, successor.accountId);
            } else {
                controller.abort(new Error("execution lease lost"));
            }
            registry.continue.resolve();
            if (failure === "transfer") {
                await expect(running).rejects.toMatchObject({ code: "REJECTED" });
            } else {
                await expect(running).rejects.toThrow("lease lost");
            }
            expect(await new LocalCollectionRepository(root).listMetadata()).toHaveLength(0);
            expect(
                await new FilesystemRepositorySourceStore(root).get("publisher", "publisher/kit", "1.0.0"),
            ).toBeNull();
        } finally {
            registry.continue.resolve();
            await running?.catch(() => undefined);
            await app.close();
            await f.close();
        }
    },
);

test("contending Repository builds wait without loading their catalogues before admission", async () => {
    const f = await sourceFixture();
    const ready = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    const root = join(f.root, "busy");
    let loads = 0;
    let running: ReturnType<typeof buildCollectionBundle> | undefined;
    let waiting: ReturnType<typeof buildCollectionBundle> | undefined;
    try {
        running = buildCollectionBundle(root, f.envelope, async () => {
            loads++;
            ready.resolve();
            await resume.promise;
            return new InMemoryReleaseCatalogue();
        });
        await ready.promise;
        const queuedEnvelope = { ...f.envelope };
        waiting = buildCollectionBundle(root, queuedEnvelope, async () => {
            loads++;
            return new InMemoryReleaseCatalogue();
        });
        queuedEnvelope.canonicalJson = "{}";
        queuedEnvelope.sourceJson = "{}";
        queuedEnvelope.assets = [];
        await Bun.sleep(30);
        expect(loads).toBe(1);
        resume.resolve();
        expect((await running).admission.digest).toBe(f.admission.digest);
        expect((await waiting).admission.digest).toBe(f.admission.digest);
        expect(loads).toBe(2);
    } finally {
        resume.resolve();
        await Promise.allSettled([running, waiting].filter(Boolean));
        await f.close();
    }
});
