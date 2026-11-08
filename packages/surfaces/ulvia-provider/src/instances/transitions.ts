import type { SystemInstallationPlan } from "./installationPlan";

export type InstanceTransitionStatus = "queued" | "running" | "succeeded" | "failed";

export type InstanceTransitionRecord = Readonly<{
    id: string;
    instanceId: string;
    kind: "provision" | "registry" | "upgrade";
    targetPlan: SystemInstallationPlan;
    sourcePlan?: SystemInstallationPlan;
    administratorSub?: string;
    sourceRevision?: number;
    planVersion: 1;
    steps: readonly string[];
    completedSteps: readonly string[];
    status: InstanceTransitionStatus;
    revision: number;
    createdAt: string;
    updatedAt: string;
    lease?: { owner: string; expiresAt: string };
    failure?: string;
}>;

export interface InstanceTransitionStore {
    init(): Promise<void>;
    createOrGet(
        transition: Omit<InstanceTransitionRecord, "revision" | "createdAt" | "updatedAt">,
    ): Promise<InstanceTransitionRecord>;
    get(id: string): Promise<InstanceTransitionRecord | null>;
    listRecoverable(now: string, limit: number): Promise<readonly InstanceTransitionRecord[]>;
    requeue(
        id: string,
        revision: number,
        now: string,
        administratorSub?: string,
        sourceRevision?: number,
    ): Promise<InstanceTransitionRecord | null>;
    claim(id: string, revision: number, owner: string, expiresAt: string, now: string): Promise<boolean>;
    renew(id: string, owner: string, expiresAt: string, now: string): Promise<boolean>;
    completeStep(id: string, owner: string, step: string, now: string): Promise<InstanceTransitionRecord | null>;
    succeed(id: string, owner: string, now: string): Promise<boolean>;
    fail(id: string, owner: string, failure: string, now: string): Promise<boolean>;
}
