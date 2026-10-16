import { relative } from "node:path";

const VIEW_ENTRY_FILE = "__cms_view_entry__.ts";

export async function writeViewRegistrationEntry(
    tempDir: string,
    viewPath: string | undefined,
    id: string,
): Promise<string> {
    const entryPath = `${tempDir}/${VIEW_ENTRY_FILE}`;
    const importPath = viewPath ? `./${relative(tempDir, viewPath).replaceAll("\\", "/")}` : null;
    const source = `
import { registerBloc } from "@bernouy/cms-content/browser";
${importPath ? `import * as viewModule from ${JSON.stringify(importPath)};` : "const viewModule = {};"}

const directMount = "mount" in viewModule && typeof viewModule.mount === "function" ? viewModule.mount : undefined;
registerBloc(${JSON.stringify(id)}, {
    mount: directMount,
});
`;
    await Bun.write(entryPath, source);
    return entryPath;
}
