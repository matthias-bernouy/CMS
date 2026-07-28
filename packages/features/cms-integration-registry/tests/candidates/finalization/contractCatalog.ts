import {
    FsIntegrationVerificationBundleStore,
    FsIntegrationVerificationContractCatalog,
} from "@bernouy/cms-integration-registry/fs";
import type { registryFixture } from "../../publication/fixtures";

export function verificationContractCatalog(
    fixture: ReturnType<typeof registryFixture>,
    bundles = new FsIntegrationVerificationBundleStore(fixture.root),
) {
    return new FsIntegrationVerificationContractCatalog({
        root: fixture.root,
        snapshots: fixture.snapshots,
        mutations: fixture.mutations,
        bundles,
    });
}
