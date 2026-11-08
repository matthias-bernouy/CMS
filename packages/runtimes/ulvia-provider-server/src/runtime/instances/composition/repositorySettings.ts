import { createHash } from "node:crypto";
import type { ProviderInstanceRecord, ProviderInstanceRegistry } from "@bernouy/ulvia-provider";
import type { InstallationServices } from "@bernouy/repository/features/installations";
import {
    InstallationError,
    normalizeRepositoryAddress as repositoryAddress,
} from "@bernouy/repository/features/installations";

type Settings = NonNullable<InstallationServices["repositorySettings"]>;
const OFFICIAL_REPOSITORY = "https://repo.ulvia.fr";

/** The public address remains persisted; only the known self-origin uses the instance's private Edge transport. */
export function repositoryTransport(instance: ProviderInstanceRecord) {
    const publicUrl = repositoryAddress(instance.repository?.url ?? OFFICIAL_REPOSITORY);
    const url = publicUrl === instance.cmsUrl ? instance.gatewayUrl : publicUrl;
    return {
        id: `site-${createHash("sha256").update(publicUrl).digest("hex")}`,
        publicUrl,
        url,
        allowInsecureHttp: new URL(url).protocol === "http:",
    };
}

export function createRepositorySettings(options: {
    instanceId: string;
    instances: Pick<ProviderInstanceRegistry, "get" | "update">;
    enabled(): Promise<boolean>;
    create(
        instance: ProviderInstanceRecord,
        expectedRevision: number,
        administratorId: string,
    ): Promise<ProviderInstanceRecord>;
    creation(
        instance: ProviderInstanceRecord,
    ): Promise<{ status: "none" | "queued" | "running" | "succeeded" | "failed" }>;
}): Settings {
    const current = async () => {
        const instance = await options.instances.get(options.instanceId);
        if (!instance || instance.status === "disabled") {
            throw new InstallationError("NOT_FOUND");
        }
        return instance;
    };
    const view = async (instance: ProviderInstanceRecord) => {
        const [repositoryEnabled, creation] = await Promise.all([options.enabled(), options.creation(instance)]);
        return {
            revision: instance.revision,
            url: instance.repository?.url ?? OFFICIAL_REPOSITORY,
            configured: instance.repository?.configured ?? false,
            repositoryEnabled,
            creationStatus: creation.status,
            errorMessage: creation.status === "failed" ? "Repository creation stopped. Resume it to retry safely." : "",
        };
    };
    return {
        siteId: "default",
        get: async () => view(await current()),
        configure: async (input) => {
            const instance = await current();
            if (instance.status !== "ready") {
                throw new InstallationError("UPGRADE_IN_PROGRESS");
            }
            const url = repositoryAddress(input.url);
            if (instance.revision !== input.expectedRevision) {
                if (instance.repository?.configured && instance.repository.url === url) {
                    return view(instance);
                }
                throw new InstallationError("REVISION_CONFLICT");
            }
            return view(
                await options.instances.update(instance.id, instance.revision, {
                    repository: { url, configured: true },
                }),
            );
        },
        create: async (input, administratorId) => {
            const instance = await current();
            if (instance.status !== "ready") {
                throw new InstallationError("UPGRADE_IN_PROGRESS");
            }
            return view(await options.create(instance, input.expectedRevision, administratorId));
        },
    };
}
