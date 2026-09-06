import { describe, expect, test } from "bun:test";
import type { Db } from "mongodb";
import { MongoCmsRepository } from "@bernouy/cms-content/mongo";
import { siteBlocDefinition, siteBlocSnapshot } from "../blocs/siteBlocFixture";
import { createMongoContentRepository } from "./contentMongoFixture";

describe("Mongo site collections", () => {
    test("persists empty collections across repository instances with tenant isolation", async () => {
        const { repository, db } = createMongoContentRepository("tenant_");
        const [first, second] = await Promise.all([
            repository.createSiteBlocCollection({ name: "Landing pages", description: "Sections" }),
            repository.createSiteBlocCollection({ name: "Campaigns", description: "" }),
        ]);
        const reloaded = new MongoCmsRepository(db as unknown as Db, { collectionPrefix: "tenant_" });
        expect(await reloaded.getSiteBlocCollections()).toEqual([
            { id: "site", name: "Site", description: "Compositions created for this site." },
            second,
            first,
        ]);
        expect(await db.get("tenant_site_bloc_collections").find({}).toArray()).toHaveLength(2);
        expect(await new MongoCmsRepository(db as unknown as Db).getSiteBlocCollections()).toHaveLength(1);
        expect(await db.get("site_bloc_collections").find({}).toArray()).toHaveLength(0);
    });

    test("leaves legacy records intact and retains membership when saving", async () => {
        const { repository, db } = createMongoContentRepository();
        const legacy = siteBlocDefinition();
        await repository.createSiteBloc(legacy);
        const before = await db.get("blocs").find({}).toArray();
        await repository.getSiteBlocCollections();
        expect(await db.get("blocs").find({}).toArray()).toEqual(before);
        const collection = await repository.createSiteBlocCollection({ name: "Sections", description: "" });
        const definition = siteBlocDefinition({ tag: "site-collection-section", collectionId: collection.id });
        await repository.createSiteBloc(definition);
        await repository.saveSiteBlocDraft(definition.tag, siteBlocSnapshot({ name: "Changed" }), 1);
        expect((await repository.getBlocRecord(definition.tag))?.siteDefinition?.collectionId).toBe(collection.id);
    });
});
