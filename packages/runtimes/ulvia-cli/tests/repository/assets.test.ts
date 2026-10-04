import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runCli } from "../../src/cli";
import { LocalArtifactFiles } from "../../src/repository/artifactFiles";
import { startLocalRepository } from "../../src/runtime/repository";

test("remote contract transfer preserves and re-verifies declared fixture bytes", async () => {
    const sourceData = await mkdtemp(join(tmpdir(), "ulvia-assets-source-"));
    const targetData = await mkdtemp(join(tmpdir(), "ulvia-assets-target-"));
    const remoteRoot = await mkdtemp(join(tmpdir(), "ulvia-assets-remote-"));
    const authoredRoot = await mkdtemp(join(tmpdir(), "ulvia-assets-authored-"));
    const directory = join(authoredRoot, "communication.receipt");
    const token = "c".repeat(43);
    const server = startLocalRepository(0, remoteRoot, token);
    try {
        await mkdir(join(directory, "fixtures"), { recursive: true });
        const fixtureRoot = resolve(
            import.meta.dir,
            "../../../../features/cms-repository/fixtures/contracts/protocol-v1",
        );
        const definition = await readFile(join(fixtureRoot, "mock.contract.json"));
        const asset = await readFile(join(fixtureRoot, "mock-assets", "receipt.svg"));
        await writeFile(join(directory, "definition.json"), definition);
        await writeFile(join(directory, "fixtures", "receipt.svg"), asset);
        const coordinate = "ulvia.official/communication.receipt@0.1.0";

        await runCli(["release", directory], {
            environment: { ULVIA_DATA_DIR: sourceData },
            log: () => undefined,
        });
        await runCli(["push", "contract", coordinate], {
            environment: {
                ULVIA_DATA_DIR: sourceData,
                ULVIA_REPOSITORY_URL: server.url,
                ULVIA_REPOSITORY_TOKEN: token,
            },
            log: () => undefined,
        });
        await runCli(["pull", "contract", coordinate], {
            environment: { ULVIA_DATA_DIR: targetData, ULVIA_REPOSITORY_URL: server.url },
            log: () => undefined,
        });

        const files = new LocalArtifactFiles(join(targetData, "repository"));
        const stored = await files.get("contracts", "ulvia.official", "communication.receipt", "0.1.0");
        expect(stored).not.toBeNull();
        expect(await files.fixture(stored!.toString("utf8"), "receipt.svg")).toEqual(asset);
    } finally {
        server.stop();
        await Promise.all(
            [sourceData, targetData, remoteRoot, authoredRoot].map((path) =>
                rm(path, { recursive: true, force: true }),
            ),
        );
    }
});
