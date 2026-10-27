import type { ProviderManagement } from "@bernouy/cms-repository/providers/management";

export interface ProviderAdministration {
    catalogue: ProviderManagement["catalogue"];
    importReference: ProviderManagement["importReference"];
    preview: ProviderManagement["preview"];
    approve: ProviderManagement["approve"];
    access(installationId: string): Promise<{
        installationId: string;
        providerId: string;
        revision: number;
        paired: boolean;
        endpoint: string;
        manifestVersion: string;
        requests: readonly {
            contractId: string;
            capabilityId: string;
            versionRange: string;
            optional: boolean;
            selected: boolean;
        }[];
    }>;
    pair(
        input: { installationId: string; expectedRevision: number; rotate?: boolean },
        actorId: string,
    ): Promise<{ installationId: string; paired: boolean }>;
}
