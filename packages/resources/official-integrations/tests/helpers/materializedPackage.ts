import { tmpdir } from "node:os";
import { join } from "node:path";
import { FsIntegrationPackageCache } from "@bernouy/cms-integration-packages/fs";
import type { BuiltOfficialIntegrationPackage } from "@bernouy/cms-official-integrations/publication";

const cache = new FsIntegrationPackageCache({
    root: join(tmpdir(), "cmscore-official-integration-packages"),
});

export async function materializeOfficialIntegrationPackage(
    integrationPackage: BuiltOfficialIntegrationPackage,
): Promise<string> {
    if (integrationPackage.sourceRoot) {
        return integrationPackage.sourceRoot;
    }
    const materialized = await cache.materialize(integrationPackage.package, {
        kind: integrationPackage.kind,
        version: integrationPackage.version,
        digest: integrationPackage.digest,
    });
    return materialized.root;
}
