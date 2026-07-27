import type { Runner } from "@bernouy/http-runner";
import {
    mountRepositoryManagementReadRoutes,
    type RepositoryManagementReadConfig,
} from "cms-repository-management/operations/readRoutes";
import {
    mountRepositoryStablePromotionRoutes,
    type RepositoryStablePromotionRoutesConfig,
} from "cms-repository-management/operations/promotionRoutes";
import {
    mountRepositoryCompatibilityReevaluationRoutes,
    type RepositoryCompatibilityReevaluationRoutesConfig,
} from "cms-repository-management/operations/reevaluationRoutes";
import {
    mountRepositoryVersionEligibilityRoutes,
    type RepositoryVersionEligibilityRoutesConfig,
} from "cms-repository-management/operations/versionEligibilityRoutes";

export type RepositoryManagementRoutesConfig = Readonly<{
    runner: Runner;
    reads?: RepositoryManagementReadConfig;
    stablePromotions?: RepositoryStablePromotionRoutesConfig;
    versionEligibility?: RepositoryVersionEligibilityRoutesConfig;
    compatibilityReevaluations?: RepositoryCompatibilityReevaluationRoutesConfig;
}>;

export function mountRepositoryManagementRoutes(config: RepositoryManagementRoutesConfig): void {
    if (config.reads) {
        mountRepositoryManagementReadRoutes(config.runner, config.reads);
    }
    if (config.stablePromotions) {
        mountRepositoryStablePromotionRoutes(config.runner, config.stablePromotions);
    }
    if (config.versionEligibility) {
        mountRepositoryVersionEligibilityRoutes(config.runner, config.versionEligibility);
    }
    if (config.compatibilityReevaluations) {
        mountRepositoryCompatibilityReevaluationRoutes(config.runner, config.compatibilityReevaluations);
    }
}
