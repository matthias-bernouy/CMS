import type { UlviaObjectSchema, UlviaSchema } from "@bernouy/ulvia-contracts/schema";
export type WorkflowExpression =
    | { readonly kind: "literal"; readonly value: unknown }
    | { readonly kind: "input" | "trigger" | "parameter"; readonly path: string }
    | { readonly kind: "step" | "error"; readonly stepId: string; readonly path: string }
    | { readonly kind: "object"; readonly fields: Readonly<Record<string, WorkflowExpression>> }
    | { readonly kind: "array"; readonly items: readonly WorkflowExpression[] }
    | { readonly kind: "exists"; readonly value: WorkflowExpression }
    | {
          readonly kind: "compare";
          readonly operator: "eq" | "gt" | "lt";
          readonly left: WorkflowExpression;
          readonly right: WorkflowExpression;
      };
export type WorkflowStep =
    | {
          readonly id: string;
          readonly kind: "call";
          readonly target: { readonly contractId: string; readonly capabilityId: string };
          readonly input: WorkflowExpression;
          readonly next: string | null;
          readonly onError: Readonly<Record<string, string>>;
      }
    | {
          readonly id: string;
          readonly kind: "condition";
          readonly test: WorkflowExpression;
          readonly then: string | null;
          readonly otherwise: string | null;
      };
export interface WorkflowTriggerSource {
    readonly kind: "event";
    readonly contractId: string;
    readonly eventType: string;
    readonly filter?: WorkflowExpression;
}
export interface WorkflowDefinition {
    readonly format: "ulvia-workflow/v1";
    readonly inputSchema: UlviaObjectSchema;
    readonly parametersSchema: UlviaObjectSchema;
    readonly outputSchema: UlviaSchema;
    readonly trigger?: WorkflowTriggerSource;
    readonly entry: string;
    readonly steps: readonly WorkflowStep[];
    readonly output: WorkflowExpression;
}
