import { expect } from "bun:test";
import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { runCli } from "../../../../packages/runtimes/ulvia-cli/src/cli";
import { readClientConfig } from "../../../../packages/runtimes/ulvia-cli/src/runtime/repository/config";
import { writeAuthoredContractFixture } from "../../../../packages/runtimes/ulvia-cli/tests/authoredContractFixture";
import { RemoteRepositoryClient } from "@bernouy/repository/repository/publication";
import { HttpCollectionRepository } from "@bernouy/repository/collections/http";
import { HttpProviderRepository } from "@bernouy/repository/providers/http";
import { repositoryApi } from "./client";

export async function exerciseCli(root: string, origin: string, token: string) {
    const data = join(root, "cli");
    const directory = join(root, "journey.cli/journey.cli.ping");
    const logs: string[] = [];
    const options = {
        environment: { ULVIA_DATA_DIR: data, ULVIA_REPOSITORY_TOKEN: token },
        home: root,
        cwd: root,
        log: (message: string) => logs.push(message),
    };
    const run = (args: string[]) => runCli(args, options);
    await run(["repository", "login", origin]);
    expect((await readClientConfig(join(data, "config"))).repository?.repositoryId).toBeString();
    await run(["namespace", "claim", "journey.cli"]);
    await mkdir(directory);
    await writeAuthoredContractFixture(directory, {
        kind: "contract",
        protocol: "ulvia-provider/v1",
        schemaDialect: "ulvia-schema/v1",
        publisherId: "journey.cli",
        contractId: "journey.cli/journey.cli.ping",
        version: "1.0.0",
        name: "CLI ping",
        capabilities: [
            {
                id: "ping",
                access: "public",
                behavior: { effect: "query", execution: "sync", sensitive: false },
                input: { type: "object", properties: {}, required: [] },
                output: { type: "null" },
                errors: [],
                bindings: [
                    {
                        id: "http",
                        transport: "http",
                        method: "GET",
                        path: "/ping",
                        response: {
                            successStatuses: [204],
                            contentTypes: [],
                            errorStatuses: {},
                        },
                    },
                ],
            },
        ],
    });
    await run(["release", directory]);
    const coordinate = "journey.cli/journey.cli.ping@1.0.0";
    await run(["push", "contract", coordinate]);
    await run(["push", "contract", coordinate]);
    expect(logs.some((line) => line.startsWith("+ contract journey.cli"))).toBe(true);
    const pulled = await new RemoteRepositoryClient(origin).pull({
        kind: "contract",
        publisherId: "journey.cli",
        id: "journey.cli.ping",
        version: "1.0.0",
    });
    expect(JSON.parse(pulled.canonicalJson).contractId).toBe("journey.cli/journey.cli.ping");
    const contracts = new HttpProviderRepository("journey", origin);
    expect((await contracts.list("ulvia/contract")).some((entry) => entry.id === "journey.cli/journey.cli.ping")).toBe(
        true,
    );
    await run(["yank", "contract", coordinate, "--reason", "Integration verification"]);
    expect((await contracts.list("ulvia/contract")).some((entry) => entry.id === "journey.cli/journey.cli.ping")).toBe(
        false,
    );
    await run(["restore", "contract", coordinate]);
    expect((await contracts.list("ulvia/contract")).some((entry) => entry.id === "journey.cli/journey.cli.ping")).toBe(
        true,
    );
    await run(["namespace", "claim", "ulvia"]);
    await run(["release", resolve("packages/official-repository"), "--recursive"]);
    await run(["push", "all"]);
    expect(
        (await new HttpCollectionRepository("journey", origin).list()).some(
            (entry) => entry.collectionId === "ulvia/mossa",
        ),
    ).toBe(true);
    await run(["repository", "logout"]);
    await expect(run(["push", "contract", coordinate, "--repository", origin])).rejects.toThrow("No credentials");
    expect(logs.join("\n")).not.toContain(token);
}

export async function exerciseCmsAuthoring(
    api: ReturnType<typeof repositoryApi>,
    origin: string,
    admin: { cookie: string },
    owner: { token: string },
    other: { token: string },
) {
    const call = (path: string, body?: unknown, method = "POST") =>
        api.request("ulvia/cms.authoring", path, method, body, admin);
    expect((await call("/get-connection", undefined, "GET")).status).toBe(200);
    const configured = await call("/configure-connection", { token: owner.token });
    expect(configured.status).toBe(200);
    const connection = await configured.json();
    expect(JSON.stringify(connection)).not.toContain(owner.token);
    const invalid = await call("/configure-connection", { token: `pat_${"x".repeat(43)}` });
    expect(invalid.status).toBe(422);
    expect((await invalid.json()).error.code).toBe("INVALID_INPUT");
    expect(await (await call("/get-connection", undefined, "GET")).json()).toEqual(connection);
    expect((await call("/claim-namespace", { namespace: "journey.cms" })).status).toBe(200);
    const guide = await readFile(
        resolve("packages/official-repository/contracts/cms.authoring/docs/collection-source.md"),
        "utf8",
    );
    const sourceJson = JSON.stringify(
        JSON.parse(guide.split("```json\n")[1]!.split("```")[0]!.replaceAll("your-namespace", "journey.cms")),
    );
    const prepared = await call("/prepare-collection", { sourceJson });
    expect(prepared.status).toBe(200);
    const artifact = await prepared.json();
    expect(artifact.valid).toBe(true);
    const published = await call("/publish-collection", {
        preparationId: artifact.preparationId,
        expectedDigest: artifact.digest,
    });
    expect(published.status).toBe(200);
    expect((await published.json()).digest).toBe(artifact.digest);
    const sources = await call(
        "/get-collection-sources",
        { namespace: "journey.cms", collectionId: "ulvia/guide-kit", version: "1.0.0" },
        "QUERY",
    );
    expect(sources.status).toBe(200);
    const retained = await sources.json();
    expect(retained.releaseDigest).toBe(artifact.digest);
    expect(JSON.parse(retained.sourceJson).files).toHaveLength(JSON.parse(sourceJson).files.length);
    const refused = await repositoryApi(origin).request(
        "ulvia/repository",
        "/v1/source-snapshots",
        "QUERY",
        {
            namespace: "journey.cms",
            namespaceRevision: 1,
            collectionId: "ulvia/guide-kit",
            version: "1.0.0",
        },
        other,
    );
    expect(refused.status).toBe(409);
    const catalogue = new HttpCollectionRepository("journey", origin);
    const entry = (await catalogue.list()).find((entry) => entry.publisherId === "journey.cms");
    expect(entry?.collectionId).toBe("ulvia/guide-kit");
    expect(entry?.blocCount).toBe(1);
    expect((await catalogue.get(entry!)).release.collectionId).toBe("ulvia/guide-kit");
    expect((await call("/disconnect-connection")).status).toBe(200);
    expect((await (await call("/get-connection", undefined, "GET")).json()).configured).toBe(false);
}
