import type { ProviderRuntimeReport } from "@bernouy/cms-repository/providers/installations";
import type { ProductionGateway } from "./createProductionGateway";

export async function assertProvisionedInstance(
    gateway: ProductionGateway,
    endpoint: string,
    report: ProviderRuntimeReport,
): Promise<void> {
    const installations = await gateway.installations.list(gateway.siteId);
    const installation = installations.find(
        ({ installation, observation }) =>
            installation.status === "enabled" &&
            installation.providerId === report.providerId &&
            installation.accountId === report.account.id &&
            installation.endpoint === endpoint &&
            installation.approval.manifestVersion === report.manifest.version &&
            installation.approval.manifestDigest === report.manifest.digest &&
            observation?.report.instanceId === report.instanceId,
    );
    if (!installation) {
        throw new Error("The Kernel instance has not been provisioned for this Ulvia Provider instance");
    }
    const selected = await gateway.selections.get(gateway.siteId);
    const pins = selected?.plan.selections ?? [];
    const incomplete = report.implementations.some(
        (implementation) =>
            implementation.status === "ready" &&
            !pins.some(
                (pin) =>
                    pin.installationId === installation.installation.id &&
                    pin.contractId === implementation.contractId &&
                    pin.version === implementation.version &&
                    pin.digest === implementation.digest,
            ),
    );
    if (incomplete) {
        throw new Error("The Kernel instance has incomplete Provider contract selections");
    }
}
