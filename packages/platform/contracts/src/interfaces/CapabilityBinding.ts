import type { HttpBindingDefinition } from "./HttpBinding";

export interface McpBindingDefinition {
    readonly transport: "mcp";
    readonly tool?: Readonly<{ name?: string; title?: string; description?: string }>;
}

/** Stable IDs distinguish alternate exposures of the same domain operation. */
export type CapabilityBinding = (HttpBindingDefinition | McpBindingDefinition) & { readonly id: string };
