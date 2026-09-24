import { admitProviderManifest } from "../../../src/manifests/core/admission/admitProviderManifest";
import { contractDocument, implementation, manifestDocument, releaseCatalogue } from "../../support/fixtures";

export const endpoint = "https://provider.example.com";
export const digest = `sha256:${"a".repeat(64)}`;

export function reportDocument() {
    return {
        protocol: "ulvia-provider/v1",
        providerId: "ulvia.example",
        account: { id: "account:SHOP_42.prod", label: "Main shop — production" },
        buildVersion: "1.4.2",
        manifest: { version: "1.0.0", digest },
        implementations: [{ contractId: "payment", version: "1.0.0", digest, status: "ready" }],
    };
}

export async function admittedReport() {
    const catalogue = await releaseCatalogue(
        contractDocument("payment", "create-link"),
        contractDocument("payment", "create-link", "2.0.0"),
    );
    const releases = await catalogue.list("payment");
    const admission = await admitProviderManifest(
        manifestDocument(
            releases.map(({ admission: release }) =>
                implementation("payment", release.release.version, release.digest),
            ),
        ),
        catalogue,
    );
    const report = reportDocument();
    report.manifest.digest = admission.digest;
    report.implementations = admission.manifest.implementations.map((entry) => ({
        contractId: entry.contractId,
        version: entry.version,
        digest: entry.digest,
        status: "ready",
    }));
    return { admission, report };
}
