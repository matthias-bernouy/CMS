// Ambient declarations for Bun's `with { type: "text" }` imports.
//
// These live in a dedicated *script* .d.ts file (no top-level
// imports/exports) so that TypeScript treats them as global ambient
// declarations. If they were placed in `global.d.ts`, the presence of
// `import type` statements there would turn that file into a module and
// the wildcard `declare module "*.css"` would no longer reach global
// scope — every `import css from "./style.css"` would then fail with
// TS2307.

declare module "*.css" {
    const content: string;
    export default content;
}

declare module "*.html" {
    const content: string;
    export default content;
}
