import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalArtifactFiles, LocalCollectionRepository } from "@bernouy/cms-repository/repository/filesystem";
import { runCli } from "../../src/cli";
import { bootstrapOfficialRepository } from "../../src/commands/bootstrap";
import { resolveDevPorts } from "../../src/commands/dev";
import { localMongoUrl } from "../../src/runtime/mongo";

describe("Ulvia CLI", () => {
    test("documents local development and repository lifecycle commands", async () => {
        const output: string[] = [];
        await runCli(["--help"], { log: (line) => output.push(line) });

        expect(output.join("\n")).toContain("ulvia dev");
        expect(output.join("\n")).toContain("ulvia release");
        expect(output.join("\n")).toContain("ulvia prune");
        expect(output.join("\n")).toContain("ulvia pull");
        expect(output.join("\n")).toContain("ulvia push");
    });

    test("accepts isolated dev ports and rejects collisions", () => {
        expect(resolveDevPorts({ ULVIA_DEV_CONTROL_PORT: "5210" })).toEqual({
            control: 5210,
            delivery: 5101,
            mongo: 27019,
            repository: 5102,
            provider: 5103,
        });
        expect(() => resolveDevPorts({ ULVIA_DEV_CONTROL_PORT: "5200", ULVIA_DEV_DELIVERY_PORT: "5200" })).toThrow(
            /ports must be distinct/,
        );
        expect(() => resolveDevPorts({ ULVIA_DEV_MONGO_PORT: "70000" })).toThrow(/between 1 and 65535/);
    });

    test("disables retryable writes for the standalone local MongoDB", () => {
        expect(localMongoUrl(27_019)).toBe("mongodb://127.0.0.1:27019/ulvia_dev?retryWrites=false");
    });

    test("admits all bundled resources needed by a fresh local stack", async () => {
        const root = await mkdtemp(join(tmpdir(), "ulvia-bootstrap-"));
        try {
            await bootstrapOfficialRepository(root);
            const artifacts = new LocalArtifactFiles(root);
            expect((await artifacts.list("contracts")).map(({ id }) => id)).toContain("ulvia.cms.pages");
            expect((await artifacts.list("providers")).map(({ id }) => id)).toEqual(["ulvia.official"]);
            expect(
                (await new LocalCollectionRepository(root).list()).map(({ release }) => release.collectionId),
            ).toEqual(["ulvia-official"]);
            await bootstrapOfficialRepository(root);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    test("rejects obsolete integration-shaped pull arguments", async () => {
        await expect(runCli(["pull", "demo"], { log: () => undefined })).rejects.toThrow("Usage: ulvia pull");
    });
});
