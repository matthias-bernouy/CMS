import { describe, expect, test } from "bun:test";
import {
    BlocLifecycleConflictError,
    BlocPublicationConflictError,
    SiteBlocLifecycleConflictError,
} from "@bernouy/cms-content";
import { MongoCmsRepository } from "@bernouy/cms-content/mongo";
import type { Db } from "mongodb";
import { siteBlocArtifact, siteBlocDefinition, siteBlocSnapshot } from "../blocs/siteBlocFixture";
import { createMongoContentRepository, FakeContentDb } from "./contentMongoFixture";

describe("MongoCmsRepository site bloc lifecycle races", () => {
    test.each(["save", "publish"] as const)(
        "does not let a concurrent %s based on the active record undo archival",
        async (operation) => {
            const { repository } = createMongoContentRepository();
            await repository.createSiteBloc(siteBlocDefinition());

            const attempts = await Promise.allSettled([
                repository.archiveSiteBloc("site-feature-panel", 1),
                operation === "save"
                    ? repository.saveSiteBlocDraft(
                          "site-feature-panel",
                          siteBlocSnapshot({ name: "Stale active draft" }),
                          1,
                      )
                    : repository.publishSiteBloc(
                          "site-feature-panel",
                          siteBlocArtifact({ viewJS: "stale-active-publication" }),
                          1,
                      ),
            ]);

            expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
            const rejected = attempts.find((attempt) => attempt.status === "rejected") as PromiseRejectedResult;
            expect(
                rejected.reason instanceof BlocLifecycleConflictError ||
                    rejected.reason instanceof SiteBlocLifecycleConflictError,
            ).toBe(true);
            const record = await repository.getBlocRecord("site-feature-panel");
            expect(record?.siteDefinition?.lifecycle).toBe("archived");
            expect(record?.siteDefinition?.draftRevision).toBe(1);
            expect(record?.artifact).toBeNull();
        },
    );

    test("does not combine a concurrent publication with a competing draft save", async () => {
        const { repository } = createMongoContentRepository();
        await repository.createSiteBloc(siteBlocDefinition());

        const attempts = await Promise.allSettled([
            repository.publishSiteBloc("site-feature-panel", siteBlocArtifact({ viewJS: "winner" }), 1),
            repository.saveSiteBlocDraft(
                "site-feature-panel",
                siteBlocSnapshot({ name: "Stale unpublished draft" }),
                1,
            ),
        ]);

        expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
        expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(1);
        const record = await repository.getBlocRecord("site-feature-panel");
        if (attempts[0]?.status === "fulfilled") {
            expect((attempts[1] as PromiseRejectedResult).reason).toBeInstanceOf(BlocPublicationConflictError);
            expect(record?.artifact?.viewJS).toBe("winner");
            expect(record?.siteDefinition?.publishedRevision).toBe(1);
            expect(record?.siteDefinition?.published).toEqual(siteBlocDefinition().draft);
            expect(record?.siteDefinition?.draftRevision).toBe(1);
        } else {
            expect(record?.artifact).toBeNull();
            expect(record?.siteDefinition?.publishedRevision).toBeNull();
            expect(record?.siteDefinition?.draft.name).toBe("Stale unpublished draft");
            expect(record?.siteDefinition?.draftRevision).toBe(2);
        }
    });

    test("serializes concurrent republishes of the same draft revision", async () => {
        const { repository } = createMongoContentRepository();
        await repository.createSiteBloc(siteBlocDefinition());
        await repository.publishSiteBloc("site-feature-panel", siteBlocArtifact({ viewJS: "baseline" }), 1);

        const attempts = await Promise.allSettled([
            repository.publishSiteBloc("site-feature-panel", siteBlocArtifact({ viewJS: "winner" }), 1),
            repository.publishSiteBloc("site-feature-panel", siteBlocArtifact({ viewJS: "stale" }), 1),
        ]);

        expect(attempts.every((attempt) => attempt.status === "fulfilled")).toBe(true);
        const record = await repository.getBlocRecord("site-feature-panel");
        expect(record?.siteDefinition?.publishedRevision).toBe(1);
        expect(["winner", "stale"]).toContain(record?.artifact?.viewJS);
    });

    test("serializes the publication graph across repository instances", async () => {
        const db = new FakeContentDb();
        const firstRepository = new MongoCmsRepository(db as unknown as Db);
        const secondRepository = new MongoCmsRepository(db as unknown as Db);
        const events: string[] = [];
        let releaseFirst!: () => void;
        const firstCanFinish = new Promise<void>((resolve) => {
            releaseFirst = resolve;
        });

        const first = firstRepository.withSiteBlocPublicationLock(async (guard) => {
            events.push("first:start");
            await firstCanFinish;
            await guard.assertHeld();
            events.push("first:end");
        });
        while (events.length === 0) {
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
        const second = secondRepository.withSiteBlocPublicationLock(async () => {
            events.push("second:start");
        });
        await new Promise((resolve) => setTimeout(resolve, 30));

        expect(events).toEqual(["first:start"]);
        releaseFirst();
        await Promise.all([first, second]);
        expect(events).toEqual(["first:start", "first:end", "second:start"]);
    });

    test("recovers a publication graph lease abandoned by another process", async () => {
        const db = new FakeContentDb();
        await db.get("site_bloc_publication_locks").insertOne({
            _id: "published-graph",
            token: "abandoned",
            expiresAt: new Date(0),
        });
        const repository = new MongoCmsRepository(db as unknown as Db);
        let entered = false;

        await repository.withSiteBlocPublicationLock(async (guard) => {
            await guard.assertHeld();
            entered = true;
        });

        expect(entered).toBe(true);
        expect(await db.get("site_bloc_publication_locks").findOne({ _id: "published-graph" })).toBeNull();
    });
});
