import type { WorkflowDefinition, WorkflowStep } from "../interfaces/definition";
import { workflowIssue } from "./errors";
export function workflowOrder(definition: WorkflowDefinition): readonly WorkflowStep[] {
    const steps = new Map(definition.steps.map((step) => [step.id, step]));
    if (steps.size !== definition.steps.length || !steps.has(definition.entry)) {
        workflowIssue("steps.identity");
    }
    const active = new Set<string>();
    const visited = new Set<string>();
    const order: WorkflowStep[] = [];
    const visit = (id: string | null) => {
        if (id === null) {
            return;
        }
        if (active.has(id)) {
            workflowIssue(`steps.${id}.cycle`);
        }
        if (visited.has(id)) {
            return;
        }
        const step = steps.get(id);
        if (!step) {
            workflowIssue(`steps.${id}.missing`);
        }
        active.add(id);
        if (step.kind === "call") {
            visit(step.next);
            for (const target of Object.values(step.onError)) {
                visit(target);
            }
        } else {
            visit(step.then);
            visit(step.otherwise);
        }
        active.delete(id);
        visited.add(id);
        order.push(step);
    };
    visit(definition.entry);
    if (visited.size !== steps.size) {
        workflowIssue("steps.unreachable");
    }
    return order.reverse();
}
