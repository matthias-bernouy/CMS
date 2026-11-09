import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { registerOfficialFeatures } from "@bernouy/ulvia-provider/capabilities";
import { TLS_CONTRACT_ID, TLS_INSTANCE_ID, TLS_SITE_ID } from "@bernouy/hosting/tls";
import type { DomainTlsAuthority } from "@bernouy/hosting/tls";
import type { ProviderManifestDigest } from "@bernouy/ulvia-providers";
import type { UlviaProviderInstanceRuntime } from "@bernouy/ulvia-provider";
import type { SystemBootstrap } from "../execution/SystemBootstrap";

export async function createTlsRuntime(
    system: SystemBootstrap,
    authority: DomainTlsAuthority,
): Promise<UlviaProviderInstanceRuntime> {
    const plan = await system.tls();
    const contracts = await system.contracts(plan);
    if (contracts.length !== 1 || contracts[0]!.release.contractId !== TLS_CONTRACT_ID) {
        throw new Error("The exact admitted TLS permission contract is unavailable");
    }
    const dispatcher = new DefaultProviderCapabilityDispatcher(contracts);
    await registerOfficialFeatures(dispatcher, { hostingTls: authority }, plan.contracts, {
        providerId: plan.manifest.providerId,
        scope: { siteId: TLS_SITE_ID, instanceId: TLS_INSTANCE_ID },
    });
    return {
        siteId: TLS_SITE_ID,
        contracts,
        dispatcher,
        report: {
            protocol: "ulvia-provider/v1",
            providerId: plan.manifest.providerId,
            instanceId: TLS_INSTANCE_ID,
            account: { id: TLS_INSTANCE_ID, label: "Hosting TLS permission" },
            buildVersion: "1.0.0",
            manifest: { version: plan.manifest.version, digest: plan.manifest.digest as ProviderManifestDigest },
            implementations: contracts.map(({ release, digest }) => ({
                contractId: release.contractId,
                version: release.version,
                digest,
                status: "ready",
            })),
        },
    };
}
