import { basename, dirname } from "node:path";
import { scanFileSourceTree } from "cms-repository/repository/authoring/sourceTree";

/** Assemble examples independently of path-derived identity. */
export async function loadCollectionExamples(directory: string): Promise<unknown[]> {
    const groups = new Map<string, Map<string, string>>();
    for (const file of await scanFileSourceTree(directory)) {
        const folder = dirname(file.relativePath);
        if (folder === ".") {
            throw new Error("Example sources must live in example folders");
        }
        const files = groups.get(folder) ?? new Map<string, string>();
        files.set(basename(file.relativePath), file.absolutePath);
        groups.set(folder, files);
    }
    const examples = [];
    for (const [folder, files] of groups) {
        if (files.size !== 2 || !files.has("definition.json") || !files.has("document.html")) {
            throw new Error(`Example ${folder} requires exactly definition.json and document.html`);
        }
        const definition = await Bun.file(files.get("definition.json")!).json();
        if (
            !definition ||
            typeof definition !== "object" ||
            Array.isArray(definition) ||
            Object.hasOwn(definition, "document")
        ) {
            throw new Error(`Example ${folder} must keep its document in document.html`);
        }
        examples.push({
            ...definition,
            document: { html: (await Bun.file(files.get("document.html")!).text()).trim() },
        });
    }
    return examples;
}
