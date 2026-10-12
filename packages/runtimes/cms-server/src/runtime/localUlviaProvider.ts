import { createHash } from "node:crypto";
import {
    UlviaProvider,
    CollectionSources,
    ProviderOperationExecutor,
    DefaultProviderCapabilityDispatcher,
    registerOfficialProviderCapabilities,
} from "@bernouy/ulvia-provider";
import { BunRunner } from "@bernouy/http-runner";
import { HttpCollectionRepository } from "@bernouy/cms-repository/collections/http";
import type { ProviderRuntimeReport } from "@bernouy/cms-repository/providers/installations";
import type { ProviderManagement } from "@bernouy/cms-repository/providers/management";
import type { RuntimeEnv } from "../runtimeEnv";
import type { ProductionGateway } from "./gateway/createProductionGateway";
import type { CoreStores } from "./stores/core";

const PROVIDER_ID = "ulvia.official";

export type LocalUlviaProviderHandle = Readonly<{
    stop(): Promise<void>;
}>;

/** Starts the local provider surface after its exact official manifest has been admitted. */
export async function startLocalUlviaProvider(options: {
    env: RuntimeEnv;
    stores: CoreStores;
    gateway: ProductionGateway;
    management: ProviderManagement;
    manifestVersion: string;
}): Promise<LocalUlviaProviderHandle> {
    const { env, stores, gateway, management, manifestVersion } = options;
    if (
        !env.ULVIA_PROVIDER_PORT ||
        !env.ULVIA_PROVIDER_PUBLIC_URL ||
        !env.ULVIA_PROVIDER_TOKEN ||
        !env.CMS_REPOSITORY_URL
    ) {
        throw new Error("The local Ulvia Provider configuration is incomplete.");
    }
    const endpoint = new URL(env.ULVIA_PROVIDER_PUBLIC_URL);
    if (
        Number(endpoint.port || defaultPort(endpoint.protocol)) !== env.ULVIA_PROVIDER_PORT ||
        endpoint.pathname !== "/"
    ) {
        throw new Error("ULVIA_PROVIDER_PUBLIC_URL must identify the configured ULVIA_PROVIDER_PORT root.");
    }
    const published = await gateway.manifests.get(PROVIDER_ID, manifestVersion);
    if (!published || published.yank) {
        throw new Error("The admitted Ulvia Provider manifest is unavailable.");
    }
    const implementations = published.admission.manifest.implementations;
    if (
        implementations.length === 0 ||
        implementations.some(({ contractId }) => !contractId.startsWith("ulvia.cms."))
    ) {
        throw new Error("The local Ulvia Provider manifest may only implement ulvia.cms.* contracts.");
    }
    const contracts = await Promise.all(
        implementations.map(async (implementation) => {
            const release = await gateway.releases.get(implementation.contractId, implementation.version);
            if (!release || release.admission.digest !== implementation.digest || release.yank) {
                throw new Error(
                    `Ulvia Provider contract is unavailable: ${implementation.contractId}@${implementation.version}`,
                );
            }
            return release.admission.release;
        }),
    );
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    const operations = new ProviderOperationExecutor(stores.providerOperations);
    registerOfficialProviderCapabilities(
        dispatcher,
        stores,
        gateway,
        operations,
        management,
        new CollectionSources(stores.collections, [
            new HttpCollectionRepository("local-ulvia-provider", env.CMS_REPOSITORY_URL),
        ]),
        stores.providerFiles,
    );
    await operations.recover();
    const report: ProviderRuntimeReport = {
        protocol: "ulvia-provider/v1",
        providerId: published.admission.manifest.providerId,
        instanceId: localProviderInstanceId(gateway.siteId),
        account: { id: "local-dev", label: "Local Ulvia Provider" },
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
    new UlviaProvider(runner, {
        token: env.ULVIA_PROVIDER_TOKEN,
        siteId: gateway.siteId,
        report,
        contracts,
        dispatcher,
    });
    runner.start(env.ULVIA_PROVIDER_PORT);
    return {
        async stop() {
            await runner.stopGracefully();
        },
    };
}

function defaultPort(protocol: string): string {
    return protocol === "https:" ? "443" : "80";
}

function localProviderInstanceId(siteId: string): string {
    const digest = createHash("sha256").update(`ulvia-local-provider-instance-v1\0${siteId}`).digest("base64url");
    return `local:${digest}`;
}
