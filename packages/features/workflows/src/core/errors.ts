export class WorkflowError extends Error {
    constructor(
        readonly code: string,
        readonly path?: string,
    ) {
        super("The workflow request was refused");
    }
}
export function workflowIssue(path: string): never {
    throw new WorkflowError("INVALID_DEFINITION", path);
}
