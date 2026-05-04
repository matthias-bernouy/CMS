// Asset imports done via Bun's `with { type: "text" }` (returns the file
// content as a string) and `with { type: "file" }` (returns the resolved
// path as a string). Our project's tsconfig uses `bun-types` which doesn't
// model these attributes — declaring the resolved shapes here is enough to
// keep `tsc --noEmit` happy without altering the rest of the codebase.

declare module "*.css" {
    const content: string;
    export default content;
}

declare module "*.html" {
    const content: string;
    export default content;
}

declare module "@bernouy/webcomponents/style.css" {
    const path: string;
    export default path;
}
