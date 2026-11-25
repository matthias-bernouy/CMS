import { maintenancePaused } from "../../../../recovery/maintenance";
import { DomainTlsAuthority, DomainTlsReconciler } from "@bernouy/hosting/tls";
import type { DomainRegistry, HostingDomainStore, HostingInstanceReader } from "@bernouy/hosting";
import type { Logger } from "@bernouy/logging";
import { runWithoutRequestContext } from "@bernouy/http-runner/observability";
import type { readTlsConfiguration } from "./configuration";
import { domainConfigurationProbe } from "./dns";
import { probeCertificate, readTlsTrust } from "./certificate";

export async function composeTlsDelivery(
    store: HostingDomainStore,
    instances: HostingInstanceReader,
    registry: DomainRegistry,
    configuration: ReturnType<typeof readTlsConfiguration>,
    logger: Logger,
) {
    const authority = new DomainTlsAuthority(store, instances, domainConfigurationProbe(configuration));
    const ca = await readTlsTrust(configuration.trustFile);
    const reconciler = new DomainTlsReconciler(
        store,
        authority,
        registry,
        (domain, signal) => probeCertificate(configuration.entrypoints, domain.hostname, signal, ca),
        (hostname, outcome) => {
            const details = { hostname, outcome };
            if (outcome === "ready" || outcome === "changed") {
                logger.debug("hosting.domain.tls", details);
            } else {
                logger.warn("hosting.domain.tls", details);
            }
        },
    );
    const abort = new AbortController();
    let timer: ReturnType<typeof setInterval> | undefined;
    const run = () =>
        maintenancePaused()
            ? Promise.resolve()
            : reconciler
                  .batch(abort.signal)
                  .catch((cause) => logger.error("hosting.tls.reconciliation.failed", {}, cause));
    return {
        authority,
        start: () => {
            if (timer || !configuration.entrypoints.length) {
                return;
            }
            runWithoutRequestContext(() => {
                void run();
                timer = setInterval(() => void run(), 10_000);
                timer.unref?.();
            });
        },
        stop: async () => {
            abort.abort();
            if (timer) {
                clearInterval(timer);
                timer = undefined;
            }
            await reconciler.drain();
        },
    };
}
