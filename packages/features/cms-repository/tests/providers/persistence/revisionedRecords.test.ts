import { expect, test } from "bun:test";
import { RevisionedRecordReader } from "cms-repository/providers/persistence/mongo/RevisionedRecordReader";

type Record = Readonly<{ revision: number; status: string }>;

function source() {
    let current: Record | null = { revision: 1, status: "enabled" };
    let unavailable = false;
    const reads: boolean[] = [];
    return {
        reads,
        change: (record: Record | null) => {
            current = record;
        },
        unavailable: (value: boolean) => {
            unavailable = value;
        },
        load: async (revisionOnly: boolean) => {
            reads.push(revisionOnly);
            if (unavailable) {
                throw new Error("Database unavailable");
            }
            return current ? structuredClone(current) : null;
        },
    };
}

const decode = (record: Record) => Object.freeze(record);

test("every hit rereads the revision and a revocation reloads its current payload", async () => {
    const db = source();
    const reader = new RevisionedRecordReader<Record>();
    await reader.get("instance/site/install", db.load, decode);
    expect((await reader.get("instance/site/install", db.load, decode))?.status).toBe("enabled");
    expect(db.reads).toEqual([false, true]);
    db.change({ revision: 2, status: "revoked" });
    expect((await reader.get("instance/site/install", db.load, decode))?.status).toBe("revoked");
    expect(db.reads).toEqual([false, true, true, false]);
    db.unavailable(true);
    await expect(reader.get("instance/site/install", db.load, decode)).rejects.toThrow("Database unavailable");
});

test("deletion and malformed revision headers cannot reuse a previously authorized record", async () => {
    const db = source();
    const reader = new RevisionedRecordReader<Record>();
    await reader.get("site/install", db.load, decode);
    db.change({ revision: -1, status: "enabled" });
    await expect(reader.get("site/install", db.load, decode)).rejects.toThrow("invalid revision");
    db.change({ revision: 2, status: "enabled" });
    await reader.get("site/install", db.load, decode);
    db.change(null);
    expect(await reader.get("site/install", db.load, decode)).toBeNull();
    db.change({ revision: 3, status: "revoked" });
    expect((await reader.get("site/install", db.load, decode))?.status).toBe("revoked");
    expect(db.reads.at(-1)).toBe(false);
});

test("cache owners and scoped keys isolate identical IDs and remain bounded", async () => {
    const a = source();
    const b = source();
    b.change({ revision: 1, status: "revoked" });
    const reader = new RevisionedRecordReader<Record>(1);
    expect((await reader.get("site-a/install", a.load, decode))?.status).toBe("enabled");
    expect((await reader.get("site-b/install", b.load, decode))?.status).toBe("revoked");
    await reader.get("site-a/install", a.load, decode);
    expect(a.reads).toEqual([false, false]);
    expect((await new RevisionedRecordReader<Record>().get("site-a/install", b.load, decode))?.status).toBe("revoked");
    const tiny = new RevisionedRecordReader<Record>(32, 1);
    await tiny.get("key", a.load, decode);
    await tiny.get("key", a.load, decode);
    expect(a.reads.slice(-2)).toEqual([false, false]);
});

test("failed payload validation is never cached and a failed revision check never serves stale data", async () => {
    const db = source();
    const reader = new RevisionedRecordReader<Record>();
    await expect(
        reader.get("key", db.load, () => {
            throw new Error("Invalid payload");
        }),
    ).rejects.toThrow("Invalid payload");
    await reader.get("key", db.load, decode);
    expect(db.reads).toEqual([false, false]);
    db.unavailable(true);
    await expect(reader.get("key", db.load, decode)).rejects.toThrow("Database unavailable");
    db.unavailable(false);
    db.change({ revision: 2, status: "revoked" });
    expect((await reader.get("key", db.load, decode))?.status).toBe("revoked");
});
