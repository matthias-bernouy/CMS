import { buildDnsProgram, startDnsService } from "./dns/container";
import { buildSmtpProgram, startSmtpService } from "./smtp/container";
import { tlsProgram } from "./tls/configuration";
import { startTlsService } from "./tls/container";
import { recoveryWorkerProfile } from "../../scenarios/installations/recovery/workerConfiguration";
import type { CapabilityInventory, ScenarioDefinition } from "../../capabilities/types";
import type { ContainerCluster } from "../../../integration/instance/containers/cluster";
import type { EnvironmentProfile } from "../../reporting/types";

/** Service code and limits are resolved before writing the immutable run header. */
export async function controlledPrograms(inventory: CapabilityInventory, scenarios: readonly ScenarioDefinition[]) {
    const keys = new Set(scenarios.flatMap((scenario) => scenario.obligations.map((row) => row.target)));
    const targets = inventory.targets.filter((row) => keys.has(row.key));
    const needsSmtp = targets.some(
        (row) =>
            (row.release.contractId === "ulvia/cms.emailer.smtp" && row.definition.id === "emailer.send") ||
            (row.release.contractId === "ulvia/cms.access" &&
                /^(?:request|confirm)-(?:email-verification|password-reset)$/u.test(row.definition.id)),
    );
    const tls = targets.some((row) => row.release.contractId === "ulvia/provider.tls") ? tlsProgram() : undefined;
    const dns =
        tls || targets.some((row) => row.release.contractId === "ulvia/cms.hosting")
            ? await buildDnsProgram()
            : undefined;
    const smtp = needsSmtp ? await buildSmtpProgram() : undefined;
    const recovery = targets.some(
        (row) =>
            row.release.contractId === "ulvia/cms.installations" && row.definition.id === "resume-collection-upgrade",
    )
        ? await recoveryWorkerProfile()
        : undefined;
    const profiles: NonNullable<EnvironmentProfile["services"]> = {
        ...(dns ? { dns: dns.profile } : {}),
        ...(smtp ? { smtp: smtp.profile } : {}),
        ...(tls ? { tls: tls.profile } : {}),
        ...(recovery ? { "collection-recovery-worker": recovery } : {}),
    };
    return { dns, smtp, tls, profiles: Object.keys(profiles).length ? profiles : undefined };
}

export async function startControlledServices(
    cluster: ContainerCluster,
    images: Readonly<{ edge: string; provider: string }>,
    programs: Awaited<ReturnType<typeof controlledPrograms>>,
) {
    const dns = programs.dns ? await startDnsService(cluster, images.edge, programs.dns) : undefined;
    const smtp = programs.smtp ? await startSmtpService(cluster, images.provider, programs.smtp) : undefined;
    const tls = programs.tls ? await startTlsService(cluster, programs.tls) : undefined;
    return {
        providerOptions: [...(dns?.providerOptions ?? []), ...(tls?.providerOptions ?? [])],
        dns: dns?.control,
        smtp,
        tls: tls?.control,
        close: async () => {
            await tls?.close();
        },
    };
}
