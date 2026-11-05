import { mkdir } from "node:fs/promises";
import { join } from "node:path";

export async function writeExampleSource(root: string): Promise<string> {
    const directory = join(root, "sample");
    const files = {
        "definition.json": JSON.stringify({
            kind: "collection",
            protocol: "ulvia-collection/v1",
            schemaDialect: "ulvia-schema/v1",
            collectionId: "example/sample",
            publisherId: "example",
            version: "1.0.0",
            locale: "en",
            name: "name",
        }),
        "translations/en/labels.json": JSON.stringify({
            name: "Sample",
            description: "An action example.",
            category: "Actions",
            examples: "Examples",
        }),
        "texts/definitions/examples.json": JSON.stringify([
            { id: "contact", label: "name", category: "examples", group: "examples" },
        ]),
        "texts/locales/en/examples.json": JSON.stringify({ "contact": "Contact us" }),
        "texts/locales/fr/examples.json": JSON.stringify({ "contact": "Contactez-nous" }),
        "blocs/example--sample--action/definition.json": JSON.stringify({
            id: "example--sample--action",
            kind: "component",
            label: "name",
            description: "description",
            categories: ["category"],
            examples: ["contact"],
            defaultExample: "contact",
            root: { accepts: ["button"], defaults: { type: "button" } },
            slots: { default: { accepts: [{ kind: "native-content", profile: "phrasing" }], min: 1 } },
        }),
        "blocs/example--sample--action/markup.html": "<slot></slot>",
        "blocs/example--sample--action/bloc.ts":
            'export function mount(root: HTMLElement) { const toggle = () => root.setAttribute("aria-pressed", String(root.getAttribute("aria-pressed") !== "true")); root.addEventListener("click", toggle); return () => root.removeEventListener("click", toggle); }',
        "blocs/example--sample--action/style.css": ":scope { display: inline-block; padding: 1rem; }",
        "examples/contact/definition.json": JSON.stringify({
            id: "contact",
            label: "name",
            description: "description",
            previews: [
                { id: "desktop", frame: { width: 640, height: 240 } },
                { id: "mobile", frame: { width: 320, height: 160 } },
            ],
        }),
        "examples/contact/document.html":
            '<button cms-bloc="example--sample--action" type="button">{{ cms.i18n.example/sample.contact }}</button>',
    };
    for (const [path, value] of Object.entries(files)) {
        const target = join(directory, path);
        await mkdir(join(target, ".."), { recursive: true });
        await Bun.write(target, value);
    }
    return directory;
}
