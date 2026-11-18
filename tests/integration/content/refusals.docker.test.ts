import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { resourceRuntimeNamespace } from "@bernouy/ulvia-contracts/protocol";
import { ValidatingContentRepository, createCmsSiteBloc, publishCmsSiteBloc } from "@bernouy/content";
import { MongoContentRepository } from "@bernouy/content/mongo";
import { prepareCollectionRelease } from "@bernouy/repository/collections/build";
import { admitCollectionRelease } from "@bernouy/repository/collections";
import { withInstalledCollections } from "@bernouy/repository/collections/content";
import { CollectionStore, MemoryCollectionStorage } from "@bernouy/repository/collections/installations";
import { contentMongo } from "./mongo";

const integration = process.env.ULVIA_RUN_CONTENT_LIFECYCLE === "1" ? test : test.skip;

for (const operation of ["create", "archive", "restore"] as const) {
    integration(
        `an actual installed-resource ${operation} refusal leaves a real Mongo instance writable`,
        async () => {
            const fixture = await contentMongo();
            try {
                const prepared = await prepareCollectionRelease(
                    fileURLToPath(
                        new URL(
                            "../../../packages/features/repository/fixtures/collections/reproduction/studio/",
                            import.meta.url,
                        ),
                    ),
                );
                // Use an installed tag that is also syntactically valid for site-composition creation.
                const namespace = resourceRuntimeNamespace("site-example/studio");
                const source = JSON.parse(
                    JSON.stringify(prepared.release)
                        .replaceAll("example/", "site-example/")
                        .replaceAll("example--studio--", `${namespace}--`),
                );
                source.publisherId = "site-example";
                const release = await admitCollectionRelease(source, prepared.assets);
                const collections = new CollectionStore(new MemoryCollectionStorage());
                await collections.importAdmittedRelease(release);
                await collections.install("site", release.digest, 0);
                const raw = new MongoContentRepository(fixture.client.db());
                await raw.init();
                const repository = new ValidatingContentRepository(withInstalledCollections(raw, collections, "site"));
                const tag = `${namespace}--section`;
                const before = await collections.listInstalled("site");
                const refused =
                    operation === "create"
                        ? createCmsSiteBloc(repository, {
                              tag,
                              name: "Replacement",
                              group: "Site",
                              content: "<p>Refused</p>",
                          })
                        : operation === "archive"
                          ? repository.archiveSiteBloc(tag, 1)
                          : repository.restoreSiteBloc(tag, 1);
                await expect(refused).rejects.toMatchObject({ status: 409 });
                expect(await collections.listInstalled("site")).toEqual(before);
                expect(await raw.getBlocRecord(tag)).toBeNull();
                expect(
                    await fixture.client
                        .db()
                        .collection("site_bloc_publication_locks")
                        .findOne({ _id: "published-graph" } as never),
                ).toBeNull();
                await createCmsSiteBloc(repository, {
                    tag: "site-after",
                    name: "After",
                    group: "Site",
                    content: "<p>Still writable</p>",
                });
                await publishCmsSiteBloc(repository, { tag: "site-after", revision: 1 });
                await repository.insertPage("/after", "After refusal", '<div cms-bloc="site-after"></div>');
                expect(await repository.getPage("/after")).not.toBeNull();
            } finally {
                await fixture.close();
            }
        },
        60_000,
    );
}
