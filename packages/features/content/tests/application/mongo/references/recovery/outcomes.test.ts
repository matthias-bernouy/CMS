import { expect, test } from "bun:test";
import { referenceFixture } from "../fixture";
import { barrier } from "../fixture";

test("a Page insert reconciled after a lost acknowledgement succeeds and leaves the instance writable", async () => {
    const { db, first, second } = await referenceFixture();
    const pages = db.get("pages");
    const insert = pages.insertOne.bind(pages);
    pages.insertOne = async (document) => {
        await insert(document);
        throw new Error("Acknowledgement lost after the Page was applied");
    };
    await first.insertPage("/applied", "Applied", '<div cms-bloc="site-target"></div>');
    expect((await first.getPage("/applied"))?.title).toBe("Applied");
    expect(await db.get("site_bloc_publication_locks").findOne({ _id: "published-graph" })).toBeNull();
    pages.insertOne = insert;
    await second.insertPage("/next", "Next", '<div cms-bloc="site-target"></div>');
    expect(await second.getPage("/next")).not.toBeNull();
});

test("a busy reference lease has a deadline and bounded polling, then accepts a later writer", async () => {
    const { db, raw, second } = await referenceFixture();
    const held = barrier();
    const release = barrier();
    const owner = raw.withContentReferenceWrite(async () => {
        held.release();
        await release.ready;
    });
    await held.ready;
    let reads = 0;
    db.get("site_bloc_publication_locks").afterFindOne = async () => {
        reads++;
    };
    const started = Date.now();
    try {
        await expect(second.withContentReferenceWrite(async () => "unexpected")).rejects.toThrow();
        expect(Date.now() - started).toBeLessThan(6500);
        expect(reads).toBeLessThanOrEqual(30);
    } finally {
        release.release();
        await owner;
    }
    await second.withContentReferenceWrite(async () => "next");
}, 8000);

test("an uncertain write swallowed without reconciliation cannot be acknowledged as success", async () => {
    const { db, raw, first } = await referenceFixture();
    db.get("blocs").beforeInsertOne = async () => {
        throw new Error("Unknown storage result");
    };
    await expect(
        raw.withContentReferenceWrite(async () => {
            try {
                await raw.createBloc({
                    id: "code-uncertain",
                    name: "Uncertain",
                    group: "Code",
                    description: "",
                    viewJS: "",
                    root: { accepts: ["div"] },
                });
            } catch {
                /* No outcome proof. */
            }
        }),
    ).rejects.toThrow();
    expect(await first.getBlocRecord("site-target")).not.toBeNull();
});

test("a failed commit transition permanently invalidates that guard, including writes attempted in a catch", async () => {
    const { db, raw, first, identity } = await referenceFixture();
    const before = await first.getBlocRecord("site-target");
    const errors: unknown[] = [];
    await raw
        .withContentReferenceWrite(async () => {
            const locks = db.get("site_bloc_publication_locks");
            const owned = (await locks.findOne({ _id: "published-graph" }))!;
            await locks.replaceOne({ _id: owned._id, token: owned.token }, { ...owned, token: "successor" });
            for (const name of ["First", "Compensation"]) {
                try {
                    await raw.saveSiteBlocDraft("site-target", { ...before!.siteDefinition!.draft, name }, 1, identity);
                    errors.push(null);
                } catch (error) {
                    errors.push(error);
                }
            }
        })
        .catch(() => {});
    expect(errors).toHaveLength(2);
    expect(errors.every((error) => error instanceof Error)).toBe(true);
    expect(await first.getBlocRecord("site-target")).toEqual(before);
    expect(await db.get("site_bloc_publication_locks").findOne({ _id: "published-graph" })).toMatchObject({
        token: "successor",
    });
});
