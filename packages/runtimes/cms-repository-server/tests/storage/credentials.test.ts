import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
    assertDistinctRepositoryCredentials,
    readRepositoryMaintenanceToken,
    readRepositoryManagementToken,
    readRepositoryWorkerCapabilitySigningKey,
    readRepositoryWorkerToken,
} from "../../src/credentials";
import { TemporaryRoots } from "./fixtures";

const roots = new TemporaryRoots();

afterEach(async () => await roots.cleanup());

describe("repository secret storage contracts", () => {
    test("reads a bounded management token from a regular secret file", async () => {
        const root = await roots.create();
        const tokenFile = join(root, "token");
        await writeFile(tokenFile, "management-secret\n", { mode: 0o600 });

        expect(await readRepositoryManagementToken(tokenFile)).toBe("management-secret");

        await writeFile(tokenFile, "two tokens");
        await expect(readRepositoryManagementToken(tokenFile)).rejects.toThrow("one non-empty Bearer token");
        await writeFile(tokenFile, "x".repeat(8_193));
        await expect(readRepositoryManagementToken(tokenFile)).rejects.toThrow("bounded regular file");
    });

    test("reads an independent maintenance token and rejects credential reuse", async () => {
        const root = await roots.create();
        const maintenanceTokenFile = join(root, "maintenance-token");
        await writeFile(maintenanceTokenFile, "maintenance-secret\n", { mode: 0o600 });

        const maintenanceToken = await readRepositoryMaintenanceToken(maintenanceTokenFile);
        expect(maintenanceToken).toBe("maintenance-secret");
        expect(() => assertDistinctRepositoryCredentials("management-secret", maintenanceToken)).not.toThrow();
        expect(() => assertDistinctRepositoryCredentials("shared-secret", "shared-secret")).toThrow(
            "management and maintenance tokens must be distinct",
        );

        await writeFile(maintenanceTokenFile, "two tokens");
        await expect(readRepositoryMaintenanceToken(maintenanceTokenFile)).rejects.toThrow(
            "maintenance token file must contain one non-empty Bearer token",
        );
    });

    test("refuses symlinked and malformed token files without exposing their paths", async () => {
        const root = await roots.create();
        const tokenFile = join(root, "private-token");
        const linkedTokenFile = join(root, "linked-token");
        await writeFile(tokenFile, "management-secret", { mode: 0o600 });
        await symlink(tokenFile, linkedTokenFile);

        for (const path of [linkedTokenFile, root, join(root, "missing-token")]) {
            const failure = readRepositoryManagementToken(path).catch((error) => error);
            expect(String(await failure)).toContain("bounded regular file");
            expect(String(await failure)).not.toContain(path);
        }

        await writeFile(tokenFile, new Uint8Array([0xc3, 0x28]));
        await expect(readRepositoryManagementToken(tokenFile)).rejects.toThrow("bounded regular file");
    });

    test("refuses a directory where a token file is required", async () => {
        const root = await roots.create();
        const directory = join(root, "token-directory");
        await mkdir(directory);

        await expect(readRepositoryManagementToken(directory)).rejects.toThrow("bounded regular file");
    });

    test("keeps worker polling and result-capability credentials independent", async () => {
        const root = await roots.create();
        const workerFile = join(root, "worker-token");
        const capabilityFile = join(root, "worker-capability-key");
        await writeFile(workerFile, "worker-secret", { mode: 0o600 });
        await writeFile(capabilityFile, "c".repeat(64), { mode: 0o600 });

        const worker = await readRepositoryWorkerToken(workerFile);
        const capability = await readRepositoryWorkerCapabilitySigningKey(capabilityFile);
        expect(worker).toBe("worker-secret");
        expect(capability).toBe("c".repeat(64));
        expect(() =>
            assertDistinctRepositoryCredentials("management", "maintenance", worker, capability),
        ).not.toThrow();
        expect(() => assertDistinctRepositoryCredentials("management", "maintenance", worker, worker)).toThrow(
            "worker capability credentials must be distinct",
        );

        await writeFile(capabilityFile, "too-short", { mode: 0o600 });
        await expect(readRepositoryWorkerCapabilitySigningKey(capabilityFile)).rejects.toThrow(
            "at least 32 non-space characters",
        );
    });
});
