import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { INTEGRATION_PACKAGE_DIGEST_HEADER } from "@bernouy/cms-integration-packages";
import { runCli } from "../src/cli";
import { integrationDefinition, integrationPackage, removeReadonlyTree } from "./fixtures";

const roots: string[] = [];
afterEach(async () => {
    await Promise.all(roots.splice(0).map(removeReadonlyTree));
});

describe("Ulvia CLI", () => {
    test("pulls the remote default once and reports it locally", async () => {
        const root = await temporaryRoot();
        const resolved = await integrationPackage();
        const environment = {
            ULVIA_DATA_DIR: root,
            ULVIA_REPOSITORY_URL: "http://repository.example.test/.cms/repository",
        };
        const output: string[] = [];
        const repositoryFetch = remoteFixture(resolved);
        await runCli(["pull", "demo"], { environment, repositoryFetch, log: (line) => output.push(line) });
        await runCli(["pull", "demo"], { environment, repositoryFetch, log: (line) => output.push(line) });
        await runCli(["status"], { environment, log: (line) => output.push(line) });

        expect(output).toEqual(
            expect.arrayContaining([
                expect.stringContaining("+ demo@1.0.0"),
                expect.stringContaining("already exists"),
            ]),
        );
        expect(output.at(-1)).toContain("demo@1.0.0");
    });

    test("refuses remote writes", async () => {
        await expect(runCli(["push"])).rejects.toThrow(/disabled/);
    });
});

async function temporaryRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "ulvia-cli-"));
    roots.push(root);
    return root;
}

function remoteFixture(resolved: Awaited<ReturnType<typeof integrationPackage>>): typeof fetch {
    const definition = integrationDefinition();
    const version = { version: "1.0.0", path: "demo/versions/1.0.0", definition: "definition.json" };
    return async (request) => {
        const url = new URL(request instanceof Request ? request.url : request);
        const headers = { "content-type": "application/json" };
        if (url.pathname.endsWith("/api/integrations/index")) {
            return Response.json({
                kind: "demo",
                label: definition.label,
                stable: "1.0.0",
                latest: "1.0.0",
                versions: [version],
            });
        }
        if (url.pathname.endsWith("/api/integrations/definition")) {
            return Response.json(definition);
        }
        if (url.pathname.endsWith("/api/integrations/package")) {
            return new Response(request.method === "HEAD" ? null : Uint8Array.from(resolved.canonicalBytes).buffer, {
                headers: {
                    ...headers,
                    "content-length": String(resolved.canonicalBytes.byteLength),
                    [INTEGRATION_PACKAGE_DIGEST_HEADER]: resolved.digest,
                },
            });
        }
        return Response.json({ error: "not found" }, { status: 404, headers });
    };
}
