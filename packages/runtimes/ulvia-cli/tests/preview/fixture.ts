import { mkdir } from "node:fs/promises";
import { join } from "node:path";

export async function writeExampleSource(root: string): Promise<string> {
    const directory = join(root, "sample");
    const files = {
        "definition.json": JSON.stringify({
            kind: "collection",
            protocol: "ulvia-collection/v1",
            schemaDialect: "ulvia-schema/v1",
            collectionId: "sample",
            publisherId: "example",
            version: "1.0.0",
            locale: "en",
            name: "name",
        }),
        "translations/en/labels.json": JSON.stringify({
            name: "Sample",
            description: "An action example.",
            category: "Actions",
        }),
        "blocs/sample-action/definition.json": JSON.stringify({
            id: "sample-action",
            kind: "component",
            label: "name",
            description: "description",
            categories: ["category"],
            examples: ["contact"],
            defaultExample: "contact",
            root: { accepts: ["button"], defaults: { type: "button" } },
            slots: { default: { accepts: [{ kind: "native-content", profile: "phrasing" }], min: 1 } },
        }),
        "blocs/sample-action/markup.html": "<slot></slot>",
        "blocs/sample-action/bloc.ts":
            'export function mount(root: HTMLElement) { const toggle = () => root.setAttribute("aria-pressed", String(root.getAttribute("aria-pressed") !== "true")); root.addEventListener("click", toggle); return () => root.removeEventListener("click", toggle); }',
        "blocs/sample-action/style.css": ":scope { display: inline-block; padding: 1rem; }",
        "examples/contact/definition.json": JSON.stringify({
            id: "contact",
            label: "name",
            description: "description",
            previews: [
                { id: "desktop", frame: { width: 640, height: 240 } },
                { id: "mobile", frame: { width: 320, height: 160 } },
            ],
        }),
        "examples/contact/document.html": '<button cms-bloc="sample-action" type="button">Contact us</button>',
    };
    for (const [path, value] of Object.entries(files)) {
        const target = join(directory, path);
        await mkdir(join(target, ".."), { recursive: true });
        await Bun.write(target, value);
    }
    return directory;
}
