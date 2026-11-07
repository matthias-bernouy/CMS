import { UlviaProvider } from "@bernouy/ulvia-provider";
import type { UlviaProviderInstanceRuntime } from "@bernouy/ulvia-provider";
import { verifyProviderInvocationToken } from "@bernouy/cms-gateway/protocol";
import { BunRunner } from "@bernouy/http-runner";
import { NOOP_LOGGER } from "@bernouy/logging";
import type { AdmittedProviderManifest } from "@bernouy/ulvia-providers";
import { scope } from "../fixture";
import { TOKEN } from "./requests";

/** Exercise the production surface, including registry sealing and its authenticated report. */
export function emailerServer(
    contracts: UlviaProviderInstanceRuntime["contracts"],
    dispatcher: UlviaProviderInstanceRuntime["dispatcher"],
    manifest: AdmittedProviderManifest,
    buildVersion: string,
) {
    const counts = { authenticate: 0, authorize: 0 };
    let allowed = true;
    const runtime: UlviaProviderInstanceRuntime = {
        siteId: scope.siteId,
        contracts,
        dispatcher,
        report: {
            protocol: "ulvia-provider/v1",
            providerId: scope.providerId,
            instanceId: scope.instanceId,
            account: { id: scope.instanceId, label: "SMTP journey" },
            buildVersion,
            manifest: { version: manifest.manifest.version, digest: manifest.digest },
            implementations: contracts.map(({ release, digest }) => ({
                contractId: release.contractId,
                version: release.version,
                digest,
                status: "ready",
            })),
        },
        authorizeInvocation: async (claims) => {
            counts.authorize++;
            return allowed && claims.actorKind === "administrator";
        },
    };
    const lease = { resource: runtime, release: () => {} };
    const runner = new BunRunner();
    new UlviaProvider(runner, {
        logger: NOOP_LOGGER,
        authenticateReportToken: async (token) => (token === TOKEN ? lease : null),
        authenticateControlToken: async () => null,
        authenticateInvocationToken: async (token) => {
            counts.authenticate++;
            try {
                const claims = verifyProviderInvocationToken(token, TOKEN);
                return claims.instanceId === scope.instanceId ? { lease, claims } : null;
            } catch {
                return null;
            }
        },
    });
    runner.start({ hostname: "127.0.0.1", port: 0 });
    const origin = `http://127.0.0.1:${runner.port}`;
    return {
        counts,
        origin,
        deny: () => {
            allowed = false;
        },
        close: () => runner.stop(),
        reportRequest: () => new Request(`${origin}/ulvia/report`, { headers: { authorization: `Bearer ${TOKEN}` } }),
    };
}
