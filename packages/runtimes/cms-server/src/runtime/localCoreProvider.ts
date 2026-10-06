import {
    CmsCore,
    CollectionSources,
    CoreOperationExecutor,
    DefaultCoreCapabilityDispatcher,
    registerOfficialCoreCapabilities,
} from "@bernouy/cms-core";
import { BunRunner } from "@bernouy/http-runner";
import { HttpCollectionRepository } from "@bernouy/cms-repository/collections/http";
import type { ProviderRuntimeReport } from "@bernouy/cms-repository/providers/installations";
import type { RuntimeEnv } from "../runtimeEnv";
import type { ProductionGateway } from "./gateway/createProductionGateway";
import type { ProviderManagement } from "./gateway/ProviderManagement";
import type { CoreStores } from "./stores/core";

const PROVIDER_ID = "ulvia.official";

export type LocalCoreProviderHandle = Readonly<{
    stop(): Promise<void>;
}>;

/** Starts the local provider surface after its exact official manifest has been admitted. */
export async function startLocalCoreProvider(options: {
    env: RuntimeEnv;
    core: CoreStores;
    gateway: ProductionGateway;
    management: ProviderManagement;
    manifestVersion: string;
}): Promise<LocalCoreProviderHandle> {
    const { env, core, gateway, management, manifestVersion } = options;
    if (!env.CORE_PORT || !env.CORE_PUBLIC_URL || !env.CMS_CORE_PROVIDER_TOKEN || !env.CMS_REPOSITORY_URL) {
        throw new Error("The local CMS Core provider configuration is incomplete.");
    }
    const endpoint = new URL(env.CORE_PUBLIC_URL);
    if (Number(endpoint.port || defaultPort(endpoint.protocol)) !== env.CORE_PORT || endpoint.pathname !== "/") {
        throw new Error("CORE_PUBLIC_URL must identify the configured CORE_PORT root.");
    }
    const published = await gateway.manifests.get(PROVIDER_ID, manifestVersion);
    if (!published || published.yank) {
        throw new Error("The admitted CMS Core provider manifest is unavailable.");
    }
    const implementations = published.admission.manifest.implementations;
    if (
        implementations.length === 0 ||
        implementations.some(({ contractId }) => !contractId.startsWith("ulvia.cms."))
    ) {
        throw new Error("The local CMS Core provider manifest may only implement ulvia.cms.* contracts.");
    }
    const contracts = await Promise.all(
        implementations.map(async (implementation) => {
            const release = await gateway.releases.get(implementation.contractId, implementation.version);
            if (!release || release.admission.digest !== implementation.digest || release.yank) {
                throw new Error(
                    `CMS Core contract is unavailable: ${implementation.contractId}@${implementation.version}`,
                );
            }
            return release.admission.release;
        }),
    );
    const dispatcher = new DefaultCoreCapabilityDispatcher();
    const operations = new CoreOperationExecutor(core.coreOperations);
    registerOfficialCoreCapabilities(
        dispatcher,
        core,
        gateway,
        operations,
        management,
        new CollectionSources(core.collections, [new HttpCollectionRepository("local-core", env.CMS_REPOSITORY_URL)]),
    );
    await operations.recover();
    const report: ProviderRuntimeReport = {
        protocol: "ulvia-provider/v1",
        providerId: published.admission.manifest.providerId,
        account: { id: "local-dev", label: "Local CMS Core" },
        buildVersion: published.admission.manifest.version,
        manifest: { version: published.admission.manifest.version, digest: published.admission.digest },
        implementations: implementations.map((implementation) => ({
            contractId: implementation.contractId,
            version: implementation.version,
            digest: implementation.digest,
            status: "ready" as const,
        })),
    };
    const hostname = endpoint.hostname === "[::1]" ? "::1" : endpoint.hostname;
    const runner = new BunRunner({ hostname });
    new CmsCore(runner, { token: env.CMS_CORE_PROVIDER_TOKEN, report, contracts, dispatcher });
    runner.start(env.CORE_PORT);
    return {
        async stop() {
            await runner.stopGracefully();
        },
    };
}

function defaultPort(protocol: string): string {
    return protocol === "https:" ? "443" : "80";
}
