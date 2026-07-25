import type { IntegrationPackageLimits } from "../../../../interfaces/envelope";
import type { IntegrationPackageCacheLayout } from "../paths";

export type PublishStagedPackageOptions = {
    layout: IntegrationPackageCacheLayout;
    staging: string;
    digest: string;
    limits?: Partial<IntegrationPackageLimits>;
    repairLockWaitMs: number;
    repairLockStaleAgeMs: number;
    now(): number;
};
