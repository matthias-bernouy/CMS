import type { Source } from "@bernouy/cms-sources";
import { commerceDashboardEndpoints } from "./dashboard";
import { commerceLiabilityEndpoints } from "./liability";
import { commerceWorkerEndpoints } from "./workers";

export function commerceOperationsEndpoints(): Source["endpoints"] {
    return [...commerceDashboardEndpoints(), ...commerceLiabilityEndpoints(), ...commerceWorkerEndpoints()];
}
