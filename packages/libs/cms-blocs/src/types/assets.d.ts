// Ambient module declarations for text-attribute imports used by the
// UI toolkit (`import foo from "./template.html" with { type: "text" }`).
// Bun inlines these at bundle time; `tsc` needs the type-side declaration.

declare module "*.html" {
    const content: string;
    export default content;
}

declare module "*.css" {
    const content: string;
    export default content;
}
