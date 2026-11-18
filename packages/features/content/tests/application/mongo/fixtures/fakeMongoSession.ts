export type FakeTransactionSupport = "supported" | "unsupported" | "unsupported-retryable-writes";

export class FakeMongoClient {
    constructor(private readonly transactions: FakeTransactionSupport) {}

    startSession(): FakeMongoSession {
        return new FakeMongoSession(this.transactions);
    }
}

class FakeMongoSession {
    constructor(private readonly transactions: FakeTransactionSupport) {}

    async withTransaction<T>(operation: () => Promise<T>): Promise<T> {
        if (this.transactions === "unsupported") {
            throw Object.assign(new Error("Transaction numbers are only allowed on a replica set member"), {
                code: 20,
                codeName: "IllegalOperation",
            });
        }
        if (this.transactions === "unsupported-retryable-writes") {
            throw new Error("This MongoDB deployment does not support retryable writes.");
        }
        return operation();
    }

    async endSession(): Promise<void> {}
}
