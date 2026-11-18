import { expect, test } from "bun:test";
import { referenceFixture } from "../fixture";
import { BSON, MongoInvalidArgumentError, MongoServerError } from "mongodb";

test("a transient reference-validation read failure leaves no business write or poisoned instance fence", async () => {
    const { db, raw, first, second } = await referenceFixture();
    const before = await raw.getBlocRecords();
    const read = raw.getBlocsList.bind(raw);
    raw.getBlocsList = async () => {
        throw new Error("Transient catalogue read failure");
    };
    await expect(first.insertPage("/refused", "Refused", '<div cms-bloc="site-target"></div>')).rejects.toThrow(
        "Transient catalogue read failure",
    );
    raw.getBlocsList = read;
    expect(await raw.getPage("/refused")).toBeNull();
    expect(await raw.getBlocRecords()).toEqual(before);
    expect(await db.get("site_bloc_publication_locks").findOne({ _id: "published-graph" })).toBeNull();
    await second.insertPage("/after", "After", '<div cms-bloc="site-target"></div>');
    expect(await second.getPage("/after")).not.toBeNull();
});

test("an actual Page deletion-intent refusal does not retain the instance reference fence", async () => {
    const { db, raw, first, second } = await referenceFixture();
    await first.insertPage("/deleting", "Deleting", '<div cms-bloc="site-target"></div>');
    const page = (await first.getPage("/deleting"))!;
    await db.get("pages").updateOne(
        { _id: page.id },
        {
            $set: {
                deletionIntent: { alternativeId: null, alternativePath: null, requestedAt: new Date() },
            },
        },
    );
    const before = await db.get("pages").findOne({ _id: page.id });
    await expect(first.updatePage({ id: page.id, title: "Refused" }, page.revision)).rejects.toThrow(
        "Page deletion is in progress",
    );
    expect(await db.get("pages").findOne({ _id: page.id })).toEqual(before);
    expect(await db.get("site_bloc_publication_locks").findOne({ _id: "published-graph" })).toBeNull();
    await second.insertPage("/independent", "Independent", '<div cms-bloc="site-target"></div>');
    expect(await raw.getPage("/independent")).not.toBeNull();
});

test("an ordinary pre-write ownership conflict releases the fence independently of its Error subclass", async () => {
    const { db, first, second } = await referenceFixture();
    const before = await first.getBlocRecords();
    await expect(
        first.withContentReferenceWrite(async () => {
            throw Object.assign(new Error("Installed collection blocs are immutable"), { status: 409 });
        }),
    ).rejects.toMatchObject({ status: 409 });
    expect(await first.getBlocRecords()).toEqual(before);
    expect(await db.get("site_bloc_publication_locks").findOne({ _id: "published-graph" })).toBeNull();
    await second.insertPage("/after-refusal", "After", '<div cms-bloc="site-target"></div>');
    expect(await second.getPage("/after-refusal")).not.toBeNull();
});

for (const refusal of [
    new MongoInvalidArgumentError("Invalid storage argument"),
    new BSON.BSONError("Serialization refused before sending"),
    new MongoServerError({ message: "Document validation refused", code: 121 }),
]) {
    test(`a definitive ${refusal.name} storage refusal does not poison later reference writes`, async () => {
        const { db, first, second, identity } = await referenceFixture();
        const before = await first.getBlocRecord("site-target");
        db.get("blocs").beforeDeleteOne = async () => {
            throw refusal;
        };
        await expect(first.deleteSiteBloc("site-target", 1, identity)).rejects.toBe(refusal);
        expect(await first.getBlocRecord("site-target")).toEqual(before);
        expect(await db.get("site_bloc_publication_locks").findOne({ _id: "published-graph" })).toBeNull();
        db.get("blocs").beforeDeleteOne = undefined;
        await second.deleteSiteBloc("site-target", 1, identity);
        expect(await first.getBlocRecord("site-target")).toBeNull();
    });
}
