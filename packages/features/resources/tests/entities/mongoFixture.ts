import type { Db } from "mongodb";

type Row = Record<string, unknown> & { _id: string };
type Filter = Record<string, unknown>;
function value(row: unknown, path: string): unknown {
    return path
        .split(".")
        .reduce<unknown>(
            (current, key) => (current && typeof current === "object" ? (current as Filter)[key] : undefined),
            row,
        );
}
function matches(row: Row, filter: Filter): boolean {
    return Object.entries(filter).every(([key, expected]) => {
        const actual = value(row, key);
        return expected && typeof expected === "object" && "$in" in expected
            ? (expected.$in as unknown[]).includes(actual)
            : actual === expected;
    });
}
export function mongoFixture() {
    const rows = new Map<string, Row>();
    const reads: { filter: Filter; limit: number; loaded: number }[] = [];
    const writes: { kind: string; filter?: Filter }[] = [];
    const indexes: unknown[] = [];
    const project = (row: Row, options: { projection?: Filter } = {}): Row => {
        if (!options.projection) {
            return structuredClone(row);
        }
        return Object.fromEntries(
            Object.entries(options.projection)
                .filter(([, included]) => included === 1)
                .map(([key]) => [key, row[key]]),
        ) as Row;
    };
    const collection = {
        createIndex: async (keys: unknown) => {
            indexes.push(keys);
            return "resource-index";
        },
        insertOne: async (input: Row) => {
            writes.push({ kind: "insert" });
            if (rows.has(input._id)) {
                throw Object.assign(new Error("duplicate"), { code: 11000 });
            }
            rows.set(input._id, structuredClone(input));
        },
        findOne: async (filter: Filter, options?: { projection?: Filter }) => {
            const row = [...rows.values()].find((row) => matches(row, filter));
            return row ? project(row, options) : null;
        },
        find: (filter: Filter, options?: { projection?: Filter }) => {
            const call = { filter: structuredClone(filter), limit: Infinity, loaded: 0 };
            reads.push(call);
            const query = {
                sort: (_sort: Filter) => query,
                limit: (count: number) => {
                    call.limit = count;
                    return query;
                },
                toArray: async () => {
                    const result = [...rows.values()]
                        .filter((row) => matches(row, filter))
                        .slice(0, call.limit)
                        .map((row) => project(row, options));
                    call.loaded = result.length;
                    return result;
                },
            };
            return query;
        },
        replaceOne: async (filter: Filter, input: Row) => {
            writes.push({ kind: "replace", filter: structuredClone(filter) });
            const row = [...rows.values()].find((row) => matches(row, filter));
            if (!row) {
                return { matchedCount: 0 };
            }
            rows.set(input._id, structuredClone(input));
            return { matchedCount: 1 };
        },
    };
    const db = {
        collection: (name: string) => {
            if (name !== "cms_resource_entities") {
                throw new Error("Unexpected resource entity collection");
            }
            return collection;
        },
    } as unknown as Db;
    return { db, rows, reads, writes, indexes };
}
