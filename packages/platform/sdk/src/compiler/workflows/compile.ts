import type { WorkflowManifest, AdmittedWorkflowManifest } from "@bernouy/ulvia-workflows";
import { admitWorkflowManifest } from "@bernouy/ulvia-workflows";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";

/** Validate the complete shared language and graph. This neither installs nor activates the artifact. */
export function compileWorkflow(definition: WorkflowManifest): AdmittedWorkflowManifest {
    return admitWorkflowManifest(canonicalizeIJson(definition));
}
