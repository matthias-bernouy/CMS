import { expect, test } from "bun:test";
import { referenceFixture } from "./fixture";

test("a deletion compare-and-swap failure reports the actual current draft revision", async () => {
    const { db, first, identity } = await referenceFixture();
    db.get("blocs").beforeDeleteOne = async () => {
        await db.get("blocs").updateOne({ _id: "site-target" }, { $set: { "siteDefinition.draftRevision": 2 } });
    };
    await expect(first.deleteSiteBloc("site-target", 1, identity)).rejects.toMatchObject({
        expectedRevision: 1,
        actualRevision: 2,
    });
    expect((await first.getBlocRecord("site-target"))!.siteDefinition!.draftRevision).toBe(2);
    expect(await db.get("site_bloc_publication_locks").findOne({ _id: "published-graph" })).toBeNull();
});

test("a concurrent archive during deletion is a state conflict and leaves the archived record intact", async () => {
    const { db, first, identity } = await referenceFixture();
    db.get("blocs").beforeDeleteOne = async () => {
        await db.get("blocs").updateOne(
            { _id: "site-target" },
            {
                $set: {
                    "siteDefinition.lifecycle": "archived",
                    "siteDefinition.updatedAt": new Date(Date.now() + 1000),
                },
            },
        );
    };
    await expect(first.deleteSiteBloc("site-target", 1, identity)).rejects.toMatchObject({ status: 409 });
    expect((await first.getBlocRecord("site-target"))!.siteDefinition!.lifecycle).toBe("archived");
    expect(await db.get("site_bloc_publication_locks").findOne({ _id: "published-graph" })).toBeNull();
});
