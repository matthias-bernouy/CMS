import { describe, expect, test } from "bun:test";
import type { Db } from "mongodb";
import { MongoCmsRepository } from "@bernouy/cms-content/mongo";
import { siteBlocDefinition, siteBlocSnapshot } from "../../blocs/siteBlocFixture";
import { createMongoContentRepository } from "./contentMongoFixture";

describe("Mongo site groups", () => {
    test("persists empty groups across repository instances with tenant isolation", async () => {
        const { repository, db } = createMongoContentRepository("tenant_");
        const [first, second] = await Promise.all([
            repository.createSiteBlocGroup({ name: "Landing pages", description: "Sections" }),
            repository.createSiteBlocGroup({ name: "Campaigns", description: "" }),
        ]);
        const reloaded = new MongoCmsRepository(db as unknown as Db, { collectionPrefix: "tenant_" });
        expect(await reloaded.getSiteBlocGroups()).toEqual([
            { id: "site", name: "Site", description: "Compositions created for this site." },
            second,
            first,
        ]);
        expect(await db.get("tenant_site_bloc_groups").find({}).toArray()).toHaveLength(2);
        expect(await new MongoCmsRepository(db as unknown as Db).getSiteBlocGroups()).toHaveLength(1);
        expect(await db.get("site_bloc_groups").find({}).toArray()).toHaveLength(0);
    });

    test("leaves legacy records intact and retains membership when saving", async () => {
        const { repository, db } = createMongoContentRepository();
        const legacy = siteBlocDefinition();
        await repository.createSiteBloc(legacy);
        const before = await db.get("blocs").find({}).toArray();
        await repository.getSiteBlocGroups();
        expect(await db.get("blocs").find({}).toArray()).toEqual(before);
        const group = await repository.createSiteBlocGroup({ name: "Sections", description: "" });
        const definition = siteBlocDefinition({ tag: "site-group-section", groupId: group.id });
        await repository.createSiteBloc(definition);
        await repository.saveSiteBlocDraft(definition.tag, siteBlocSnapshot({ name: "Changed" }), 1);
        expect((await repository.getBlocRecord(definition.tag))?.siteDefinition?.groupId).toBe(group.id);
    });
});

test("renames default and named groups without changing membership or duplicating the default", async () => {
    const { repository, db } = createMongoContentRepository("tenant_");
    const custom = await repository.createSiteBlocGroup({ name: "Sections", description: "" });
    const updated = await repository.updateSiteBlocGroup(custom.id, {
        name: "Campaigns",
        description: "Reusable",
        icon: "star",
    });
    await repository.updateSiteBlocGroup("site", { name: "Our site", description: "Private", icon: "layers" });
    const reloaded = new MongoCmsRepository(db as unknown as Db, { collectionPrefix: "tenant_" });
    expect(await reloaded.getSiteBlocGroups()).toEqual([
        { id: "site", name: "Our site", description: "Private", icon: "layers" },
        updated,
    ]);
    expect(await new MongoCmsRepository(db as unknown as Db).getSiteBlocGroups()).toHaveLength(1);
    await expect(repository.updateSiteBlocGroup("unknown", { name: "No", description: "" })).rejects.toThrow(
        "not found",
    );
    await expect(
        repository.updateSiteBlocGroup(custom.id, { name: "No", description: "", icon: "bad" as "star" }),
    ).rejects.toThrow("unsupported");
});
