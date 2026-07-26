import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { loadDisposableVerificationDatabaseProvider } from "../../src";
import { DIGEST_A, DIGEST_B } from "../fixtures/contracts";

describe("disposable database provider composition", () => {
    test("loads only the explicit prebuilt provider contract", async () => {
        const provider = await loadDisposableVerificationDatabaseProvider(
            join(import.meta.dir, "../fixtures/databaseProvider.ts"),
        );

        const lease = await provider.acquire(
            { candidateId: "candidate-1", packageDigest: DIGEST_A, verificationDigest: DIGEST_B },
            new AbortController().signal,
        );

        expect(lease.credential.databaseId).toBe("database-candidate-1");
        expect(lease.credential.connectionUri).toStartWith("postgresql://ephemeral:");
        await lease.release();
    });

    test("does not expose module loader failures or module internals", async () => {
        await expect(loadDisposableVerificationDatabaseProvider("/missing/private/provider-secret.ts")).rejects.toThrow(
            "Disposable verification database provider module could not be loaded",
        );
    });
});
