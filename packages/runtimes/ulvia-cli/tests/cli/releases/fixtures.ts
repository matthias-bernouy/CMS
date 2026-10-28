import { prepareContractSource } from "ulvia-cli/release/authored/contract";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runCli } from "../../../src/cli";
import { LocalArtifactFiles } from "@bernouy/cms-repository/repository/filesystem";
import { writeAuthoredContractFixture } from "../../authoredContractFixture";

export async function batchFixture() {
    const root = await mkdtemp(join(tmpdir(), "ulvia-release-batch-"));
    const source = join(root, "source");
    const data = join(root, "data");
    const output: string[] = [];
    await mkdir(source);
    const options = { cwd: root, environment: { ULVIA_DATA_DIR: data }, log: (line: string) => output.push(line) };
    return {
        root,
        source,
        data,
        output,
        files: new LocalArtifactFiles(join(data, "repository")),
        run: (args: string[]) => runCli(args, options),
        async contract(id: string, options: { parent?: string; group?: string; version?: string } = {}) {
            const directory = join(source, options.group ?? "", id);
            const parent = options.parent
                ? (await prepareContractSource(join(source, options.parent))).admission
                : null;
            await writeAuthoredContractFixture(directory, {
                ...(parent
                    ? {
                          extends: {
                              contractId: parent.release.contractId,
                              version: parent.release.version,
                              digest: parent.digest,
                          },
                      }
                    : {}),
                kind: "contract",
                protocol: "ulvia-provider/v1",
                schemaDialect: "ulvia-schema/v1",
                contractId: id,
                version: options.version ?? "1.0.0",
                publisherId: "batch",
                name: "Batch contract",
                capabilities: [
                    {
                        id: parent ? "child.ping" : "ping",

                        access: "public",
                        behavior: { sensitive: false, effect: "query", execution: "sync" },
                        input: { type: "object", properties: {}, required: [] },
                        output: { type: "null" },
                        errors: [],
                        bindings: [
                            {
                                id: "http",
                                transport: "http",
                                method: "GET",
                                path: parent ? "/child/ping" : "/ping",
                                response: { successStatuses: [204], contentTypes: [], errorStatuses: {} },
                            },
                        ],
                    },
                ],
            });
            return directory;
        },
        close: () => rm(root, { recursive: true, force: true }),
    };
}
