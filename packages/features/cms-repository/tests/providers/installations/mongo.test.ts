import { expect, test } from "bun:test";
import type { Db } from "mongodb";
import { MongoProviderInstallationStore } from "@bernouy/cms-repository/providers/mongo";
import { installationWorkflow } from "./lifecycle/fixtures";

type Document = {
    _id: string;
    siteId: string;
    revision: number;
    installation: { status: string };
};

class Collection {
    readonly documents = new Map<string, Document>();

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

    find(filter: { siteId: string }) {
        return {
            sort: () => ({
                toArray: async () =>
                    [...this.documents.values()]
                        .filter((document) => document.siteId === filter.siteId)
                        .sort((left, right) => left._id.localeCompare(right._id))
                        .map((document) => structuredClone(document)),
            }),
        };
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
    const recreated = new MongoProviderInstallationStore(db, fixture.catalogue, fixture.clock);
    expect((await recreated.get(fixture.scope))?.installation).toEqual(approved.installation);
    expect(await recreated.get({ ...fixture.scope, siteId: "another-site" })).toBeNull();
    const disabled = await first.setStatus(fixture.scope, 1, "disabled");
    expect(disabled.revision).toBe(2);
    expect(await first.revision(fixture.scope.siteId)).not.toBe(approvedRevision);
    await expect(recreated.setStatus(fixture.scope, 1, "revoked")).rejects.toMatchObject({
        code: "revision_conflict",
    });
    const revoked = await recreated.setStatus(fixture.scope, 2, "revoked");
    expect(revoked.installation.status).toBe("revoked");
    await expect(first.recordObservation(fixture.scope, 3, fixture.report)).rejects.toMatchObject({
        code: "installation_revoked",
    });
});
