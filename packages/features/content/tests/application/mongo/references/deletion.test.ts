import { expect, test } from "bun:test";
import type { Db } from "mongodb";
import { MongoContentRepository } from "@bernouy/content/mongo";
import {
    SiteBlocReferencedError,
    SiteBlocPublicationRecoveryRequiredError,
    ValidatingContentRepository,
    createCmsSiteBloc,
    publishCmsSiteBloc,
} from "@bernouy/content";
import { siteBlocDefinition, siteBlocSnapshot } from "../../../blocs/siteBlocFixture";
import { referenceFixture } from "./fixture";

test("Mongo reference refusal loads only a bounded projection and preserves the complete record", async () => {
    const { db, first, identity } = await referenceFixture();
    for (let index = 0; index < 20; index++) {
        await first.insertPage(`/page-${index}`, "Consumer", '<div cms-bloc="site-target"></div>');
    }
    const pages = db.get("pages");
    pages.findCalls.length = 0;
    pages.findOptions.length = 0;
    pages.loadedResults.length = 0;
    const before = await first.getBlocRecord("site-target");
    await expect(first.deleteSiteBloc("site-target", 1, identity)).rejects.toMatchObject({
        truncated: true,
        references: expect.any(Array),
    });
    expect(pages.findCalls).toEqual([{ contentReferences: "bloc:site-target" }]);
    expect(pages.findOptions).toEqual([{ projection: { _id: 1 }, maxTimeMS: 1000 }]);
    expect(pages.loadedResults[0]).toHaveLength(17);
    expect(pages.loadedResults[0]!.every((row) => Object.keys(row).join() === "_id")).toBe(true);
    expect(await first.getBlocRecord("site-target")).toEqual(before);
    expect(await db.get("site_bloc_publication_locks").findOne({ _id: "published-graph" })).toBeNull();
});

test("Mongo deletion checks draft, published and inline dependencies without requiring undeclared uses", async () => {
    const { db, first, identity } = await referenceFixture();
    const draft = siteBlocSnapshot({
        structure: [{ kind: "bloc", tag: "site-target", attributes: {}, children: [] }],
        slots: [],
        defaultContent: "",
    });
    await first.createSiteBloc(siteBlocDefinition({ draft }));
    await publishCmsSiteBloc(first, { tag: "site-feature-panel", revision: 1 });
    await first.saveSiteBlocDraft(
        "site-feature-panel",
        siteBlocSnapshot({ structure: [], slots: [], defaultContent: "" }),
        1,
    );
    await expect(first.deleteSiteBloc("site-target", 1, identity)).rejects.toBeInstanceOf(SiteBlocReferencedError);
    await first.deleteSiteBloc("site-feature-panel", 2, "definition-1");
    await first.createBloc({
        id: "code-consumer",
        kind: "composition",
        name: "Consumer",
        group: "Code",
        description: "",
        root: { accepts: ["div"] },
        viewJS: "",
        markupHTML: '<div cms-bloc="site-target"></div>',
    });
    db.get("blocs").loadedResults.length = 0;
    await expect(first.deleteSiteBloc("site-target", 1, identity)).rejects.toMatchObject({
        references: [{ kind: "bloc", id: "code-consumer" }],
    });
    expect(db.get("blocs").loadedResults.at(-1)).toEqual([{ _id: "code-consumer" }]);
});

test("Mongo reference query failure refuses deletion and releases a read-only critical section", async () => {
    const { db, first, identity } = await referenceFixture();
    const before = await first.getBlocRecord("site-target");
    db.get("pages").beforeFind = async () => {
        throw new Error("query deadline exceeded");
    };
    await expect(first.deleteSiteBloc("site-target", 1, identity)).rejects.toThrow("analysis could not complete");
    expect(await first.getBlocRecord("site-target")).toEqual(before);
    expect(await db.get("site_bloc_publication_locks").findOne({ _id: "published-graph" })).toBeNull();
});

test("an uncertain Mongo delete keeps its non-stealable fence until explicit recovery", async () => {
    const { db, first, second, identity } = await referenceFixture();
    db.get("blocs").beforeDeleteOne = async () => {
        throw new Error("indeterminate network failure");
    };
    await expect(first.deleteSiteBloc("site-target", 1, identity)).rejects.toThrow("indeterminate");
    const locks = db.get("site_bloc_publication_locks");
    expect(await locks.findOne({ _id: "published-graph" })).toMatchObject({ phase: "committing" });
    await locks.updateOne({ _id: "published-graph" }, { $set: { committingAt: new Date(0) } });
    await expect(second.withContentReferenceWrite(async () => {})).rejects.toBeInstanceOf(
        SiteBlocPublicationRecoveryRequiredError,
    );
    expect(await first.getBlocRecord("site-target")).not.toBeNull();
});

test("an upstream upgrade fence refusal releases the reference lock without poisoning later writes", async () => {
    const { db, first, second } = await referenceFixture();
    const before = await first.getBlocRecord("site-target");
    await expect(
        first.withContentReferenceWrite(async () => {
            throw Object.assign(new Error("Upgrade in progress"), { status: 423 });
        }),
    ).rejects.toMatchObject({ status: 423 });
    expect(await db.get("site_bloc_publication_locks").findOne({ _id: "published-graph" })).toBeNull();
    await second.withContentReferenceWrite(async () => {});
    expect(await first.getBlocRecord("site-target")).toEqual(before);
});

test("Mongo reference lookups and fences stay isolated by collection prefix", async () => {
    const { db } = await referenceFixture();
    const a = new MongoContentRepository(db as unknown as Db, { collectionPrefix: "a_" });
    const b = new MongoContentRepository(db as unknown as Db, { collectionPrefix: "b_" });
    await a.init();
    await b.init();
    const first = new ValidatingContentRepository(a);
    const second = new ValidatingContentRepository(b);
    for (const repository of [first, second]) {
        await createCmsSiteBloc(repository, {
            tag: "site-target",
            name: "Target",
            group: "Site",
            content: "<p>Shared</p>",
        });
        await publishCmsSiteBloc(repository, { tag: "site-target", revision: 1 });
    }
    await second.insertPage("/consumer", "Consumer", '<div cms-bloc="site-target"></div>');
    const identity = (await first.getBlocRecord("site-target"))!.siteDefinition!.id;
    await first.deleteSiteBloc("site-target", 1, identity);
    expect(await first.getBlocRecord("site-target")).toBeNull();
    expect(await second.getBlocRecord("site-target")).not.toBeNull();
});
