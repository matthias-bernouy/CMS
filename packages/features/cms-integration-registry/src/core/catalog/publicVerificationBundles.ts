import type { IntegrationRegistryCatalogSnapshotProvider } from "../../interfaces/catalog";
import type {
    IntegrationVerificationBundleStore,
    StoredIntegrationVerificationBundle,
} from "../../interfaces/reportStore";

export type PublishedIntegrationVerificationBundleReaderConfig = Readonly<{
    catalog: IntegrationRegistryCatalogSnapshotProvider;
    bundles: Pick<IntegrationVerificationBundleStore, "get">;
}>;

/** Keeps candidate-only objects private until their version is activated in the public catalogue. */
export class PublishedIntegrationVerificationBundleReader {
    constructor(private readonly config: PublishedIntegrationVerificationBundleReaderConfig) {}

    async get(digest: string): Promise<StoredIntegrationVerificationBundle | null> {
        const snapshot = this.config.catalog.current();
        const published = snapshot.summaries.some((summary) =>
            snapshot
                .listVersions(summary.kind)
                .some((version) => version.verificationDigest === digest && version.status !== "unverified"),
        );
        if (!published) {
            return null;
        }
        const bundle = await this.config.bundles.get(digest);
        if (!bundle) {
            throw new Error(`Published verification bundle ${digest} is unavailable`);
        }
        return bundle;
    }
}
