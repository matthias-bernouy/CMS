import { prepareContractSource } from "ulvia-cli/release/authored/contract";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { identityFixture } from "../identities/fixture";
import { writeAuthoredContractFixture } from "../../authoredContractFixture";
import { LocalArtifactFiles } from "@bernouy/cms-repository/repository/filesystem";

export async function pushFixture() {
    const f = await identityFixture();
    await f.run(["repository", "login", f.server.url.origin]);
    await f.run(["namespace", "claim", "ulvia.official"]);
    const source = join(f.root, "source");
    await mkdir(source);
    return {
        ...f,
        source,
        remoteFiles: new LocalArtifactFiles(f.remote),
        async contract(
            id: string,
            options: { parent?: string; publisher?: string; version?: string; group?: string } = {},
        ) {
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
                publisherId: options.publisher ?? "ulvia.official",
                name: "Push contract",
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
    };
}
