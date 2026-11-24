import { createHash } from "node:crypto";
/** One publication cannot occur twice along the same causal branch. Sibling runs remain independent. */
export function workflowAncestry(
    workflowId: string,
    revision: number,
    parent: readonly string[] = [],
): readonly string[] | null {
    const key = createHash("sha256")
        .update("ulvia-workflow-publication/v1\0")
        .update(JSON.stringify([workflowId, revision]))
        .digest("hex");
    if (parent.length >= 32 || parent.includes(key)) {
        return null;
    }
    return [...parent, key];
}
