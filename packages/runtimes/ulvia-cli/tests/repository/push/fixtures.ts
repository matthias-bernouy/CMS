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
            options: { dependency?: string; publisher?: string; version?: string; group?: string } = {},
        ) {
            const directory = join(source, options.group ?? "", id);
            await writeAuthoredContractFixture(directory, {
                kind: "contract",
                protocol: "ulvia-provider/v1",
                schemaDialect: "ulvia-schema/v1",
                contractId: id,
                version: options.version ?? "1.0.0",
                publisherId: options.publisher ?? "ulvia.official",
                name: "Push contract",
                capabilities: [
                    {
                        id: "ping",
                        access: "public",
                        behavior: { effect: "query", execution: "sync" },
                        input: { type: "object", properties: {}, required: [] },
                        output: { type: "null" },
                        errors: [],
                        ...(options.dependency
                            ? {
                                  requires: [
                                      { contractId: options.dependency, capabilityId: "ping", versionRange: "^1.0.0" },
                                  ],
                              }
                            : {}),
                        bindings: [
                            {
                                id: "http",
                                transport: "http",
                                method: "GET",
                                path: "/ping",
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
