// Asset imports done via Bun's `with { type: "text" }` (returns the file
// content as a string). Our tsconfig uses `bun-types` which doesn't model
// these attributes — declaring the resolved shapes here is enough to keep
// `tsc --build` happy without altering the rest of the codebase.

declare module "*.css" {
    const content: string;
    export default content;
}

declare module "*.html" {
    const content: string;
    export default content;
}
