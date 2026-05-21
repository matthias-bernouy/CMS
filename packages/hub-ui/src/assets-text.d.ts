// Ambient declarations for Bun's `with { type: "text" }` imports.
// Kept in a script .d.ts (no top-level import/export) so the wildcard
// `declare module` reaches global scope.

declare module "*.css" {
    const content: string;
    export default content;
}

declare module "*.html" {
    const content: string;
    export default content;
}
