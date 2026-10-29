import type { ContractSelection } from "@bernouy/cms-repository/providers/selections";
import type {
    ProviderRuntimeReport,
    StoredProviderInstallation,
} from "@bernouy/cms-repository/providers/installations";

export function nativeInstallationMatches(
    siteId: string,
    report: ProviderRuntimeReport,
    selection: ContractSelection,
    stored: StoredProviderInstallation | undefined,
): boolean {
    const installation = stored?.installation;
    const observed = stored?.observation?.report;
    return Boolean(
        installation &&
            observed &&
            installation.siteId === siteId &&
            installation.id === selection.installationId &&
            installation.status === "enabled" &&
            installation.providerId === report.providerId &&
            installation.accountId === report.account.id &&
            installation.approval.manifestDigest === observed.manifest.digest &&
            installation.approval.manifestVersion === observed.manifest.version &&
            observed.instanceId === report.instanceId &&
            observed.providerId === report.providerId &&
            observed.account.id === report.account.id &&
            observed.implementations.some(
                (pin) =>
                    pin.contractId === selection.contractId &&
                    pin.version === selection.version &&
                    pin.digest === selection.digest &&
                    pin.status === "ready",
            ),
    );
}
