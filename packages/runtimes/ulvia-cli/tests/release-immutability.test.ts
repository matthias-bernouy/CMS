import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../src/cli";
import { removeReadonlyTree, writeIntegrationSource } from "./fixtures";

const roots: string[] = [];
afterEach(async () => {
    await Promise.all(roots.splice(0).map(removeReadonlyTree));
});

describe("release coordinate immutability", () => {
    test("does not consult remote state while releasing a local coordinate", async () => {
        const root = await mkdtemp(join(tmpdir(), "ulvia-release-immutability-"));
        roots.push(root);
        const source = join(root, "source");
        await writeIntegrationSource(source);
        let verified = false;
        let remoteRequests = 0;

        await runCli(["release", "demo"], {
            cwd: source,
            environment: {
                ULVIA_DATA_DIR: join(root, "data"),
                ULVIA_REPOSITORY_URL: "http://repository.example.test/.cms/repository",
            },
            repositoryFetch: async () => {
                remoteRequests += 1;
                throw new Error("remote repository must not be used by release");
            },
            releaseVerifier: { verify: async () => void (verified = true) },
            log: () => undefined,
        });
        expect(verified).toBeTrue();
        expect(remoteRequests).toBe(0);
    });
});
