import type { RepositoryCapabilityService } from "cms-repository/repository/capabilities/service";

/** Structurally typed domain operations; concrete persistence remains runtime-owned. */
export type RepositoryService = Pick<RepositoryCapabilityService, "reads" | "namespaces" | "sources" | "publications">;
export interface RepositoryActor {
    readonly providerId: string;
    readonly subjectId?: string;
}
export interface RepositoryServices {
    readonly repository: RepositoryService;
    resolveRepositoryAccount(context: RepositoryActor): Promise<string>;
}
