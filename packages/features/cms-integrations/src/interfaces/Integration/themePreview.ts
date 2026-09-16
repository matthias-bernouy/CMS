export type IntegrationThemePreviewDefinition = {
    /** Renderer selected by the consuming surface. Unknown renderers may be ignored. */
    kind: string;
    /** Renderer-local slots mapped to integration-local theme token identifiers. */
    bindings: Record<string, string>;
};
