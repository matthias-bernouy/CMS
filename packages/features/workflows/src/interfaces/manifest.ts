import type { WorkflowDefinition } from "./definition";

export interface WorkflowRequirement {
    readonly contractId: string;
    readonly versionRange: string;
    readonly capabilityIds: readonly string[];
    readonly eventIds: readonly string[];
}
/** Portable declarative artifact. Instance configuration and credentials never belong here. */
export interface WorkflowManifest {
    readonly kind: "workflow";
    readonly format: "ulvia-workflow-manifest/v1";
    readonly workflowId: string;
    readonly publisherId: string;
    readonly name: string;
    readonly description?: string;
    readonly documentation?: string;
    readonly version: string;
    readonly requirements: readonly WorkflowRequirement[];
    readonly definition: WorkflowDefinition;
}
export interface AdmittedWorkflowManifest {
    readonly manifest: WorkflowManifest;
    readonly canonicalJson: string;
    readonly digest: `sha256:${string}`;
}
