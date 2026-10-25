/** Minimal observable Mongo port for identity outcome and inventory tests. */
export class DatabaseFixture {
    readonly collections = new Map<string, CollectionFixture>();
    collection(name: string) {
        if (!this.collections.has(name)) {
            this.collections.set(name, new CollectionFixture());
        }
        return this.collections.get(name)!;
    }
}
export class CollectionFixture {
    readonly records = new Map<string, any>();
    onInsert?: (record: any) => void;
    onRead?: () => void;
    async findOne(query: any) {
        this.onRead?.();
        return structuredClone(this.records.get(query._id) ?? null);
    }
    async insertOne(record: any) {
        if (this.onInsert) {
            this.onInsert(record);
            return;
        }
        if (this.records.has(record._id)) {
            throw new Error("Duplicate key");
        }
        this.records.set(record._id, structuredClone(record));
    }
    async updateOne(query: any, update: any) {
        this.records.set(query._id, { ...this.records.get(query._id), _id: query._id, ...update.$set });
    }
    find(query: any) {
        let limit = Infinity;
        return {
            sort() {
                return this;
            },
            limit(value: number) {
                limit = value;
                return this;
            },
            toArray: async () =>
                [...this.records.values()]
                    .filter(
                        (record) =>
                            record.repositoryId === query.repositoryId &&
                            (!query._id ||
                                (typeof query._id === "string"
                                    ? record._id === query._id
                                    : record._id > query._id.$gt)),
                    )
                    .sort((a, b) => (a._id < b._id ? -1 : a._id > b._id ? 1 : 0))
                    .slice(0, limit),
        };
    }
}
