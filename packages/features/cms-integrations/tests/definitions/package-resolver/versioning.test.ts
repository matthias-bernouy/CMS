import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { FsIntegrationPackageCache } from "@bernouy/cms-integration-packages/fs";
import { FsIntegrationPackageResolver } from "@bernouy/cms-integrations/fs";
import { staticPackageSource } from "./sourceFixture";
import { cleanupResolverWorkspaces, temporaryResolverWorkspace } from "./workspaceFixture";

const cleanup: string[] = [];
afterEach(async () => await cleanupResolverWorkspaces(cleanup));

describe("filesystem integration package resolver version identity", () => {
    test("rejects non-exact SemVer requests before storage or source access", async () => {
        const workspace = await temporaryResolverWorkspace(cleanup);
        const source = staticPackageSource(null);
        const resolver = new FsIntegrationPackageResolver({
            cache: new FsIntegrationPackageCache({ root: workspace.cacheRoot }),
            source,
        });

        for (const version of ["1.0", "v1.0.0", " 1.0.0", "latest"]) {
            await expect(
                resolver.resolve({
                    kind: "resolver-demo",
                    version,
                    reason: "create",
                    allowEmbeddedFallback: false,
                }),
            ).rejects.toThrow("version must be an exact SemVer 2.0 version");
        }

        expect(existsSync(workspace.cacheRoot)).toBe(false);
        expect(source.calls).toEqual([]);
    });
});
