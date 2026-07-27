import type { DisposableVerificationDatabaseProvider } from "../../src";

export function createDisposableVerificationDatabaseProvider(): DisposableVerificationDatabaseProvider {
    return {
        async probe(signal) {
            signal.throwIfAborted();
        },
        async acquire(identity, signal) {
            signal.throwIfAborted();
            return {
                credential: {
                    databaseId: `database-${identity.candidateId}`,
                    connectionUri: "postgresql://ephemeral:disposable-secret@postgres:5432/cmscore_contracts_1",
                },
                async release() {},
            };
        },
    };
}
