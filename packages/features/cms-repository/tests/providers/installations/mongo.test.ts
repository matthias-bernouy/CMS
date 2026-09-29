import { expect, test } from "bun:test";
import type { Db } from "mongodb";
import { MongoProviderInstallationStore } from "@bernouy/cms-repository/providers/mongo";
import { installationSelectionRevision } from "cms-repository/providers/installations/core/selectionRevision";
import { installationDocument } from "cms-repository/providers/installations/default-implementation/mongo/record";
import { installationWorkflow } from "./lifecycle/fixtures";

type Document = {
    _id: string;
    siteId: string;
    revision: number;
    installation: { status: string };
    selectionDigest?: string;
};

class Collection {
    readonly documents = new Map<string, Document>();
    readonly projections: Record<string, number>[] = [];

    async createIndex(): Promise<string> {
        return "siteId_1__id_1";
    }

    async insertOne(value: Document): Promise<void> {
        this.documents.set(value._id, structuredClone(value));
    }

    async findOne(filter: { _id: string; siteId: string }): Promise<Document | null> {
        const value = this.documents.get(filter._id);
        return value?.siteId === filter.siteId ? structuredClone(value) : null;
    }

    find(filter: { siteId: string }, options?: { projection?: Record<string, number> }) {
        if (options?.projection) {
            this.projections.push(options.projection);
        }
        return {
            sort: () => ({
                toArray: async () =>
                    [...this.documents.values()]
                        .filter((document) => document.siteId === filter.siteId)
                        .sort((left, right) => left._id.localeCompare(right._id))
                        .map((document) =>
                            options?.projection
                                ? (Object.fromEntries(
                                      Object.keys(options.projection).map((key) => [
                                          key,
                                          document[key as keyof Document],
                                      ]),
                                  ) as Document)
                                : structuredClone(document),
                        ),
            }),
        };
    }

    async updateOne(
        filter: { _id: string; siteId: string; revision: number; selectionDigest: { $exists: false } },
        update: { $set: { selectionDigest: string } },
    ): Promise<{ matchedCount: number }> {
        const current = this.documents.get(filter._id);
        if (
            !current ||
            current.siteId !== filter.siteId ||
            current.revision !== filter.revision ||
            current.selectionDigest
        ) {
            return { matchedCount: 0 };
        }
        this.documents.set(filter._id, { ...current, selectionDigest: update.$set.selectionDigest });
        return { matchedCount: 1 };
    }

    async replaceOne(
        filter: { _id: string; siteId: string; revision: number },
        value: Document,
    ): Promise<{ matchedCount: number }> {
        const current = this.documents.get(filter._id);
        if (
            !current ||
            current.siteId !== filter.siteId ||
            current.revision !== filter.revision ||
            current.installation.status === "revoked"
        ) {
            return { matchedCount: 0 };
        }
        this.documents.set(value._id, structuredClone(value));
        return { matchedCount: 1 };
    }
}

test("Mongo installation state survives adapter recreation and fences stale writers", async () => {
    const fixture = await installationWorkflow();
    const collection = new Collection();
    const db = { collection: () => collection } as unknown as Db;
    const first = new MongoProviderInstallationStore(db, fixture.catalogue, fixture.clock);
    await first.init();
    const beforeRevision = await first.revision(fixture.scope.siteId);
    const approved = await first.approve({
        candidate: fixture.candidate,
        report: fixture.report,
        preparedAt: fixture.clock(),
        approvedBy: "admin:owner",
    });
    expect(approved.revision).toBe(1);
    const approvedRevision = await first.revision(fixture.scope.siteId);
    expect(approvedRevision).not.toBe(beforeRevision);
    const approvedSelectionRevision = await first.selectionRevision(fixture.scope.siteId);
    expect(await installationSelectionRevision(fixture.scope.siteId, [approved.installation])).toBe(
        approvedSelectionRevision,
    );
    expect(collection.projections.at(-1)).toEqual({ _id: 1, selectionDigest: 1 });
    expect(collection.documents.get(fixture.scope.installationId)?.selectionDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    const recreated = new MongoProviderInstallationStore(db, fixture.catalogue, fixture.clock);
    expect((await recreated.get(fixture.scope))?.installation).toEqual(approved.installation);
    expect(await recreated.get({ ...fixture.scope, siteId: "another-site" })).toBeNull();
    const observed = await first.recordObservation(fixture.scope, 1, fixture.report);
    expect(observed.revision).toBe(2);
    expect(await first.revision(fixture.scope.siteId)).not.toBe(approvedRevision);
    expect(await first.selectionRevision(fixture.scope.siteId)).toBe(approvedSelectionRevision);
    delete collection.documents.get(fixture.scope.installationId)!.selectionDigest;
    expect(await first.selectionRevision(fixture.scope.siteId)).toBe(approvedSelectionRevision);
    expect(collection.documents.get(fixture.scope.installationId)?.selectionDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    const disabled = await first.setStatus(fixture.scope, 2, "disabled");
    expect(disabled.revision).toBe(3);
    expect(await first.revision(fixture.scope.siteId)).not.toBe(approvedRevision);
    expect(await first.selectionRevision(fixture.scope.siteId)).not.toBe(approvedSelectionRevision);
    await expect(recreated.setStatus(fixture.scope, 1, "revoked")).rejects.toMatchObject({
        code: "revision_conflict",
    });
    const revoked = await recreated.setStatus(fixture.scope, 3, "revoked");
    expect(revoked.installation.status).toBe("revoked");
    await expect(first.recordObservation(fixture.scope, 4, fixture.report)).rejects.toMatchObject({
        code: "installation_revoked",
    });
});

test("Mongo selection metadata hashes nested installation configuration", async () => {
    const fixture = await installationWorkflow();
    const collection = new Collection();
    const db = { collection: () => collection } as unknown as Db;
    const store = new MongoProviderInstallationStore(db, fixture.catalogue, fixture.clock);
    let nested: unknown = "value";
    for (let depth = 0; depth < 12; depth += 1) {
        nested = { child: nested };
    }
    const approved = await store.approve({
        candidate: fixture.candidate,
        report: fixture.report,
        preparedAt: fixture.clock(),
        approvedBy: "admin:owner",
    });
    const document = await installationDocument({
        installation: { ...approved.installation, configuration: { nested } },
        revision: 1,
    });
    expect(document.selectionDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
});
