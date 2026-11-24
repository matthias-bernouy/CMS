import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../../src/cli";
import {
    LocalArtifactFiles,
    LocalContractReleases,
    LocalWorkflowReleases,
} from "@bernouy/repository/repository/filesystem";
import { startTestRepository } from "../../repository/fixture";

test("portable workflows survive CLI release, push, pull, yank and immutable retries", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-workflow-transfer-"));
    const source = join(root, "source");
    const target = join(root, "target");
    const folder = join(root, "sources", "check");
    const server = startTestRepository(join(root, "remote"));
    const options = (data: string) => ({
        environment: { ULVIA_DATA_DIR: data, ULVIA_REPOSITORY_URL: server.url },
        log: () => undefined,
    });
    const releases = (data: string) => {
        const files = new LocalArtifactFiles(join(data, "repository"));
        return new LocalWorkflowReleases(files, new LocalContractReleases(files));
    };
    const manifest = {
        kind: "workflow",
        format: "ulvia-workflow-manifest/v1",
        workflowId: "ulvia/check",
        publisherId: "ulvia",
        version: "1.0.0",
        name: "Check",
        requirements: [],
        definition: {
            format: "ulvia-workflow/v1",
            parametersSchema: { type: "object", properties: {}, required: [] },
            inputSchema: { type: "object", properties: {}, required: [] },
            outputSchema: { type: "boolean" },
            entry: "check",
            steps: [
                {
                    id: "check",
                    kind: "condition",
                    test: { kind: "literal", value: true },
                    then: null,
                    otherwise: null,
                },
            ],
            output: { kind: "literal", value: true },
        },
    };
    try {
        await mkdir(folder, { recursive: true });
        await writeFile(join(folder, "definition.json"), JSON.stringify(manifest));
        await server.connect(source);
        await runCli(["release", folder], options(source));
        const original = await releases(source).getMetadata("ulvia", "ulvia/check", "1.0.0");
        expect(original).not.toBeNull();
        await runCli(["push", "ulvia/check@1.0.0"], options(source));
        await runCli(["push", "all"], options(source));
        await runCli(["pull", "workflow", "ulvia/check@1.0.0"], options(target));
        expect(await releases(target).getMetadata("ulvia", "ulvia/check", "1.0.0")).toEqual(original);
        await runCli(["yank", "workflow", "ulvia/check@1.0.0", "--reason", "Review"], options(source));
        const catalogue = () =>
            fetch(`${server.url}/.cms/call/ulvia/repository/v1/artifacts/catalogue`, {
                method: "QUERY",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ kind: "workflow", limit: 10 }),
            }).then((response) => response.json()) as Promise<{ releases: unknown[] }>;
        expect((await catalogue()).releases).toHaveLength(0);
        await runCli(["restore", "workflow", "ulvia/check@1.0.0"], options(source));
        expect((await catalogue()).releases).toHaveLength(1);
        await writeFile(join(folder, "definition.json"), JSON.stringify({ ...manifest, name: "Changed" }));
        await expect(runCli(["release", folder], options(source))).rejects.toThrow(/different|already|immutable/);
        expect(await releases(source).getMetadata("ulvia", "ulvia/check", "1.0.0")).toEqual(original);
    } finally {
        await server.stop();
        await rm(root, { recursive: true, force: true });
    }
}, 30000);
