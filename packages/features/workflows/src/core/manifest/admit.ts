import { createHash } from "node:crypto";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import type { AdmittedWorkflowManifest } from "workflows/interfaces/manifest";
import { parseWorkflowManifest } from "./parse";
import { workflowOrder } from "../graph";
import { workflowIssue } from "../errors";

export function admitWorkflowManifest(input: string): AdmittedWorkflowManifest {
    const manifest = parseWorkflowManifest(input);
    workflowOrder(manifest.definition);
    const canonicalJson = canonicalizeIJson(manifest);
    if (Buffer.byteLength(canonicalJson) > 1048576) {
        workflowIssue("manifest.byteLimit");
    }
    return freeze({
        manifest,
        canonicalJson,
        digest: `sha256:${createHash("sha256").update(canonicalJson).digest("hex")}`,
    }) as AdmittedWorkflowManifest;
}
export function verifyStoredWorkflowManifest(input: string, expectedDigest: string): AdmittedWorkflowManifest {
    const admission = admitWorkflowManifest(input);
    if (input !== admission.canonicalJson || admission.digest !== expectedDigest) {
        workflowIssue("manifest.integrity");
    }
    return admission;
}
function freeze(value: unknown): unknown {
    if (value && typeof value === "object") {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
    }
    return value;
}
