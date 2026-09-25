import { admitProviderManifest } from "@bernouy/cms-repository/providers";
import { contractDocument, implementation, manifestDocument, releaseCatalogue } from "../support/fixtures";

export function installationDocument() {
    return {
        id: "installation:SHOP_42",
        siteId: "site:STORE_1",
        providerId: "ulvia.example",
        accountId: "account:SHOP_42.prod",
        endpoint: "https://provider.example.com",
        status: "enabled",
        approval: {
            manifestVersion: "1.0.0",
            manifestDigest: `sha256:${"a".repeat(64)}`,
            approvedAt: "2026-09-24T10:00:00Z",
            approvedBy: "admin:OWNER_1",
        },
        providerTokenRef: "${SHOP_PROVIDER_TOKEN}",
        gatewayTokenRef: "${SHOP_GATEWAY_TOKEN}",
        configuration: { locale: "en" },
        createdAt: "2026-09-24T09:00:00Z",
        updatedAt: "2026-09-24T11:00:00Z",
    };
}

export async function admittedInstallation() {
    const catalogue = await releaseCatalogue(contractDocument("payment", "create-link"));
    const release = (await catalogue.list())[0].admission;
    const admission = await admitProviderManifest(
        manifestDocument([implementation("payment", "1.0.0", release.digest)], {
            configuration: {
                type: "object",
                properties: { locale: { type: "string", enum: ["en", "fr"], maxLength: 2 } },
                required: ["locale"],
            },
        }),
        catalogue,
    );
    const installation = installationDocument();
    installation.approval.manifestDigest = admission.digest;
    return { admission, installation };
}

export function registrationDocument() {
    return {
        protocol: "ulvia-provider/v1",
        installationId: "installation:SHOP_42",
        gatewayUrl: "https://cms.example.com/ulvia/gateway",
        gatewayToken: "example-bootstrap-token-not-a-real-secret",
    };
}
