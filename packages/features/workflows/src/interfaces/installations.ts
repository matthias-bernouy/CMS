import type { WorkflowPlan } from "./definition";
export interface WorkflowArtifactReference {
    readonly repositoryId: string;
    readonly publisherId: string;
    readonly workflowId: string;
    readonly version: string;
    readonly digest: string;
}
export interface WorkflowInstallation {
    readonly id: string;
    readonly revision: number;
    readonly reference: WorkflowArtifactReference;
    readonly workflowId: string;
    readonly manifestRef: string;
    readonly parametersRef: string;
    readonly publishedRevision: number | null;
    readonly pendingPublication: number | null;
    readonly state: "installed" | "removing" | "removed";
    readonly administratorId: string;
    readonly updatedAt: string;
}
export type WorkflowInstallationSummary = Omit<
    WorkflowInstallation,
    "manifestRef" | "parametersRef" | "administratorId" | "pendingPublication"
>;
export interface WorkflowInstallationStore {
    create(record: WorkflowInstallation): Promise<WorkflowInstallation>;
    get(id: string): Promise<WorkflowInstallation | null>;
    list(
        cursor: string | undefined,
        limit: number,
    ): Promise<{ readonly items: readonly WorkflowInstallationSummary[]; readonly nextCursor?: string }>;
    pending(limit: number): Promise<readonly WorkflowInstallation[]>;
    replace(record: WorkflowInstallation, expectedRevision: number): Promise<boolean>;
    finishPublication(id: string, revision: number): Promise<void>;
    markPublished(id: string, revision: number): Promise<boolean>;
}
export interface WorkflowArtifacts {
    read(reference: WorkflowArtifactReference): Promise<string>;
}
export interface InstalledWorkflowPlanStore {
    publishInstalledPlan(
        installationId: string,
        workflowId: string,
        revision: number,
        plan: WorkflowPlan,
    ): Promise<void>;
    confirmInstalledPlan(installationId: string, workflowId: string, revision: number): Promise<void>;
    retireInstalledPlans(workflowId: string): Promise<void>;
}
