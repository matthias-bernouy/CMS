import type { RepositoryCapabilityService } from "repository/repository/capabilities/service";

/** Structurally typed domain operations; concrete persistence remains runtime-owned. */
export type RepositoryService = Pick<RepositoryCapabilityService, "reads" | "namespaces" | "sources" | "publications">;
export interface RepositoryActor {
    readonly providerId: string;
    readonly subjectId?: string;
}
export interface RepositoryServices {
    readonly repository: RepositoryService;
    readonly repositoryOperations?: {
        get(
            siteId: string,
            input: {
                operationId: string;
                namespace: string;
                namespaceRevision: number;
                uploadId: string;
            },
            actor: RepositoryActor,
        ): Promise<{
            operationId: string;
            status: "queued" | "running" | "succeeded" | "failed";
            result?: unknown;
            errorCode?: string;
            errorOutput?: unknown;
        }>;
    };
    resolveRepositoryAccount(context: RepositoryActor): Promise<string>;
}
