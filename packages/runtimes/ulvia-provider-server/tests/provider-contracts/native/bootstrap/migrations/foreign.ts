import { admitProviderManifest } from "@bernouy/ulvia-providers";
import type { migrationFixture } from "./fixture";
export async function selectForeignEmailer(f: Awaited<ReturnType<typeof migrationFixture>>, forms = false) {
    const claim = f.artifacts.manifest.implementations.find((pin) => pin.contractId === "ulvia/cms.emailer.smtp")!;
    const claims = [
        claim,
        ...(forms
            ? [
                  {
                      ...f.artifacts.manifest.implementations.find((pin) => pin.contractId === "ulvia/cms.forms")!,
                      version: f.legacy.release.version,
                      digest: f.legacy.digest,
                  },
              ]
            : []),
    ];
    const admission = await admitProviderManifest(
        {
            ...f.artifacts.manifest,
            providerId: "test/foreign",
            version: "1.0.0",
            requires: [],
            provenance: { ...f.artifacts.manifest.provenance, publisherId: "test" },
            endpoint: { allowedOrigins: ["https://foreign.example"], defaultOrigin: "https://foreign.example" },
            implementations: claims,
        },
        f.stores.releases,
    );
    await f.stores.manifests.publish(admission);
    const report = {
        protocol: "ulvia-provider/v1",
        providerId: admission.manifest.providerId,
        instanceId: "instance:foreign",
        account: { id: "foreign", label: "Foreign" },
        buildVersion: "1.0.0",
        manifest: { version: admission.manifest.version, digest: admission.digest },
        implementations: claims.map((pin) => ({
            contractId: pin.contractId,
            version: pin.version,
            digest: pin.digest,
            status: "ready",
        })),
    };
    const installed = await f.stores.installations.approve({
        candidate: {
            id: "installation:foreign",
            siteId: "default",
            providerId: admission.manifest.providerId,
            accountId: "foreign",
            endpoint: "https://foreign.example",
            manifestVersion: admission.manifest.version,
            manifestDigest: admission.digest,
            providerTokenRef: "${FOREIGN_TOKEN}",
            configuration: {},
        },
        report,
        preparedAt: new Date().toISOString(),
        approvedBy: "test:operator",
    });
    await f.stores.installations.recordObservation(
        { siteId: "default", installationId: installed.installation.id },
        installed.revision,
        report,
    );
    const before = (await f.stores.selections.get("default"))!;
    const pin = {
        siteId: "default",
        installationId: installed.installation.id,
        contractId: claim.contractId,
        version: claim.version,
        digest: claim.digest,
    };
    const pins = claims.map((item) => ({
        ...pin,
        contractId: item.contractId,
        version: item.version,
        digest: item.digest,
    }));
    await f.stores.selections.replace(
        "default",
        before.plan.selections.map((value) => pins.find((next) => next.contractId === value.contractId) ?? value),
        before.revision,
        before.grants,
    );
    return {
        pin,
        installed: (await f.stores.installations.get({
            siteId: "default",
            installationId: installed.installation.id,
        }))!,
    };
}
