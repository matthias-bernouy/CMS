import { createHash } from "node:crypto";
import {
    UlviaProvider,
    CollectionSources,
    ProviderOperationExecutor,
    DefaultProviderCapabilityDispatcher,
    registerOfficialProviderCapabilities,
    type ProviderOperationStore,
} from "@bernouy/ulvia-provider";
import { BunRunner } from "@bernouy/http-runner";
import { HttpCollectionRepository } from "@bernouy/cms-repository/collections/http";
import type { ProviderRuntimeReport } from "@bernouy/cms-repository/providers/installations";
import type { ProviderManagement } from "@bernouy/cms-repository/providers/management";
import type { ProviderRuntimeEnv } from "../runtimeEnv";
import type { ProviderGateway } from "./gateway/createProviderGateway";
import type { ProviderStores } from "./stores/providerStores";

const PROVIDER_ID = "ulvia.official";

export type UlviaProviderServerHandle = Readonly<{
    stop(): Promise<void>;
}>;

/** Mounts the official provider surface after its exact manifest has been admitted. */
export async function mountUlviaProvider(options: {
    env: ProviderRuntimeEnv;
    stores: ProviderStores;
    gateway: ProviderGateway;
    management: ProviderManagement;
    providerOperations: ProviderOperationStore;
    manifestVersion: string;
}): Promise<UlviaProviderServerHandle> {
    const { env, stores, gateway, management, providerOperations, manifestVersion } = options;
    const published = await gateway.manifests.get(PROVIDER_ID, manifestVersion);
    if (!published || published.yank) {
        throw new Error("The admitted Ulvia Provider manifest is unavailable.");
    }
    const implementations = published.admission.manifest.implementations;
    if (
        implementations.length === 0 ||
        implementations.some(({ contractId }) => !contractId.startsWith("ulvia.cms."))
    ) {
        throw new Error("The Ulvia Provider manifest may only implement ulvia.cms.* contracts.");
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
    const operations = new ProviderOperationExecutor(providerOperations);
    registerOfficialProviderCapabilities(
        dispatcher,
        stores,
        gateway,
        operations,
        management,
        new CollectionSources(stores.collections, [
            new HttpCollectionRepository("ulvia-provider-server", env.CMS_REPOSITORY_URL),
        ]),
        stores.providerFiles,
    );
    await operations.recover();
    const report: ProviderRuntimeReport = {
        protocol: "ulvia-provider/v1",
        providerId: published.admission.manifest.providerId,
        instanceId: providerInstanceId(gateway.siteId),
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
    const runner = new BunRunner({ hostname: env.ULVIA_PROVIDER_HOST });
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

function providerInstanceId(siteId: string): string {
    const digest = createHash("sha256").update(`ulvia-local-provider-instance-v1\0${siteId}`).digest("base64url");
    return `local:${digest}`;
}
