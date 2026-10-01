import { relative } from "node:path";

const VIEW_ENTRY_FILE = "__p9r_view_entry__.ts";

export async function writeViewRegistrationEntry(tempDir: string, viewPath: string): Promise<string> {
    const entryPath = `${tempDir}/${VIEW_ENTRY_FILE}`;
    const importPath = `./${relative(tempDir, viewPath).replaceAll("\\", "/")}`;
    const source = `
import * as viewModule from ${JSON.stringify(importPath)};

const tag = "BE5_TAG_TO_BE_REPLACED";
if (!customElements.get(tag)) {
    const Bloc = viewModule.Bloc ?? viewModule.default ??
        Object.values(viewModule).find((value) => typeof value === "function");
    if (typeof Bloc !== "function") {
        throw new TypeError("Bloc view must export one component class or register its manifest tag");
    }
    customElements.define(tag, Bloc as CustomElementConstructor);
}
`;
    await Bun.write(entryPath, source);
    return entryPath;
}
