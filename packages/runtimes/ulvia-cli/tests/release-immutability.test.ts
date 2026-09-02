import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { INTEGRATION_PACKAGE_DIGEST_HEADER } from "@bernouy/cms-integration-packages";
import { runCli } from "../src/cli";
import { integrationDefinition, integrationPackage, removeReadonlyTree, writeIntegrationSource } from "./fixtures";

const roots: string[] = [];
afterEach(async () => {
    await Promise.all(roots.splice(0).map(removeReadonlyTree));
});

describe("release coordinate immutability", () => {
    test("refuses a local digest when the coordinate is already remote", async () => {
        const root = await mkdtemp(join(tmpdir(), "ulvia-release-immutability-"));
        roots.push(root);
        const source = join(root, "source");
        await writeIntegrationSource(source);
        const remotePackage = await integrationPackage();
        let verified = false;

        await expect(
            runCli(["release", "demo"], {
                cwd: source,
                environment: {
                    ULVIA_DATA_DIR: join(root, "data"),
                    ULVIA_REPOSITORY_URL: "http://repository.example.test/.cms/repository",
                },
                repositoryFetch: remoteFixture(remotePackage),
                releaseVerifier: { verify: async () => void (verified = true) },
                log: () => undefined,
            }),
        ).rejects.toThrow(/different immutable digest/);
        expect(verified).toBeFalse();
    });
});

function remoteFixture(resolved: Awaited<ReturnType<typeof integrationPackage>>): typeof fetch {
    return async (request) => {
        const url = new URL(request instanceof Request ? request.url : request);
        if (url.pathname.endsWith("/api/integrations/versions")) {
            return Response.json([{ version: "1.0.0", path: "versions/1.0.0", definition: "definition.json" }]);
        }
        if (url.pathname.endsWith("/api/integrations/definition")) {
            return Response.json(integrationDefinition());
        }
        if (url.pathname.endsWith("/api/integrations/package")) {
            return new Response(request.method === "HEAD" ? null : Uint8Array.from(resolved.canonicalBytes).buffer, {
                headers: {
                    "content-length": String(resolved.canonicalBytes.byteLength),
                    "content-type": "application/json",
                    [INTEGRATION_PACKAGE_DIGEST_HEADER]: resolved.digest,
                },
            });
        }
        return Response.json({ error: "not found" }, { status: 404 });
    };
}
