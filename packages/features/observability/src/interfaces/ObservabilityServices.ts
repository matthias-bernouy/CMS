import type { CmsObservability } from "observability/core/CmsObservability";
export type ObservabilityService = Pick<CmsObservability, "append" | "query" | "get" | "aggregate">;
export interface ObservabilityServices {
    readonly observability: ObservabilityService;
}
