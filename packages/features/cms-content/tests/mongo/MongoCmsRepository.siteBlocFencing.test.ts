import { describe, expect, test } from "bun:test";
import { SiteBlocPublicationLockLostError, SiteBlocPublicationRecoveryRequiredError } from "@bernouy/cms-content";
import { MongoCmsRepository } from "@bernouy/cms-content/mongo";
import type { Db } from "mongodb";
import { siteBlocArtifact, siteBlocDefinition } from "../blocs/siteBlocFixture";
import { FakeContentDb } from "./contentMongoFixture";

describe("MongoCmsRepository site bloc publication fencing", () => {
    test("self-wraps direct writes and replaces the bloc in the lock transaction", async () => {
        const db = new FakeContentDb();
        const repository = new MongoCmsRepository(db as unknown as Db);
        await repository.createSiteBloc(siteBlocDefinition());

        await repository.publishSiteBloc("site-feature-panel", siteBlocArtifact(), 1);

        const lockSessions = db.get("site_bloc_publication_locks").usedSessions;
        const blocSessions = db.get("blocs").usedSessions;
        expect(lockSessions).toHaveLength(1);
        expect(blocSessions.length).toBeGreaterThanOrEqual(2);
        expect(blocSessions.every((session) => session === lockSessions[0])).toBe(true);
    });

    test("rejects a stale holder after a successor has replaced its lease", async () => {
        const db = new FakeContentDb();
        const repository = new MongoCmsRepository(db as unknown as Db);
        const locks = db.get("site_bloc_publication_locks");
        await repository.createSiteBloc(siteBlocDefinition());

        await repository.withSiteBlocPublicationLock(async (guard) => {
            const active = await locks.findOne({ _id: "published-graph" });
            await locks.replaceOne(
                { _id: "published-graph", token: active?.token },
                {
                    _id: "published-graph",
                    token: "successor",
                    expiresAt: new Date(Date.now() + 30_000),
                    phase: "leased",
                },
            );

            await expect(
                repository.publishSiteBloc("site-feature-panel", siteBlocArtifact(), 1, undefined, guard),
            ).rejects.toBeInstanceOf(SiteBlocPublicationLockLostError);
        });

        expect((await repository.getBlocRecord("site-feature-panel"))?.artifact).toBeNull();
    });

    test("uses the durable commit phase when Mongo transactions are unavailable", async () => {
        const db = new FakeContentDb("unsupported");
        const repository = new MongoCmsRepository(db as unknown as Db);
        await repository.createSiteBloc(siteBlocDefinition());

        const published = await repository.publishSiteBloc("site-feature-panel", siteBlocArtifact(), 1);

        expect(published.siteDefinition?.publishedRevision).toBe(1);
        expect(db.get("site_bloc_publication_locks").usedSessions).toHaveLength(0);
        expect(await db.get("site_bloc_publication_locks").findOne({ _id: "published-graph" })).toBeNull();
    });

    test("does not let a successor reclaim a standalone lock during its commit phase", async () => {
        const db = new FakeContentDb("unsupported");
        const repository = new MongoCmsRepository(db as unknown as Db);
        const locks = db.get("site_bloc_publication_locks");
        await repository.createSiteBloc(siteBlocDefinition());
        let releaseCommit!: () => void;
        let commitStarted!: () => void;
        const commitCanFinish = new Promise<void>((resolve) => {
            releaseCommit = resolve;
        });
        const commitDidStart = new Promise<void>((resolve) => {
            commitStarted = resolve;
        });
        locks.afterUpdateOne = async (update) => {
            if (update.$set.phase === "committing") {
                commitStarted();
                await commitCanFinish;
            }
        };

        const first = repository.withSiteBlocPublicationLock((guard) =>
            repository.publishSiteBloc("site-feature-panel", siteBlocArtifact(), 1, undefined, guard),
        );
        await commitDidStart;
        let successorEntered = false;
        const successor = repository.withSiteBlocPublicationLock(async () => {
            successorEntered = true;
        });
        await new Promise((resolve) => setTimeout(resolve, 30));

        expect(successorEntered).toBe(false);
        releaseCommit();
        await Promise.all([first, successor]);
        expect(successorEntered).toBe(true);
    });

    test("fails closed instead of spinning on an abandoned standalone commit", async () => {
        const db = new FakeContentDb("unsupported");
        const repository = new MongoCmsRepository(db as unknown as Db);
        await db.get("site_bloc_publication_locks").insertOne({
            _id: "published-graph",
            token: "abandoned-commit",
            expiresAt: new Date(0),
            phase: "committing",
            committingAt: new Date(0),
        });

        await expect(repository.withSiteBlocPublicationLock(async () => {})).rejects.toBeInstanceOf(
            SiteBlocPublicationRecoveryRequiredError,
        );
    });
});
