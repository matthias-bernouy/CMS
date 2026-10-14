export type BindingValueSchema =
    | { readonly type: "string"; readonly enum?: readonly string[]; readonly nullable?: true }
    | { readonly type: "number" | "integer"; readonly nullable?: true }
    | { readonly type: "boolean"; readonly nullable?: true }
    | { readonly type: "null" }
    | {
          readonly type: "object";
          readonly properties: Readonly<Record<string, BindingValueSchema>>;
          readonly required: readonly string[];
          readonly nullable?: true;
      }
    | { readonly type: "map"; readonly values: BindingValueSchema; readonly nullable?: true }
    | {
          readonly type: "array";
          readonly items: BindingValueSchema;
          readonly minItems?: number;
          readonly nullable?: true;
      }
    | { readonly type: "binary"; readonly nullable?: true };

export interface BindingCapabilityError {
    readonly code: string;
    readonly retryable: boolean;
    readonly output?: BindingValueSchema;
}

export interface BindingCapability {
    readonly contractId: string;
    readonly capabilityId: string;
    readonly output: BindingValueSchema;
    readonly errors: readonly BindingCapabilityError[];
}

export type BindingQueryCapability = BindingCapability;

export interface BindingQueryTarget {
    readonly contractId: string;
    readonly capabilityId: string;
}

export type BindingQueryCapabilityResolver = (
    targets: readonly BindingQueryTarget[],
) => Promise<readonly BindingQueryCapability[]>;

export interface BindingCapabilityTarget extends BindingQueryTarget {
    readonly effect: "query" | "command";
}

export type BindingCapabilityResolver = (
    targets: readonly BindingCapabilityTarget[],
) => Promise<readonly BindingCapability[]>;

export interface BindingAnalysisOptions {
    readonly capabilities?: readonly BindingCapability[];
    /** When true, every provider query must resolve to an exact supplied capability description. */
    readonly requireCapabilityResolution?: boolean;
}
