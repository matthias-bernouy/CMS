import { resourceRuntimeNamespace } from "@bernouy/ulvia-contracts/protocol";

/** Bounded real source compilation keeps the operation pending long enough to inspect its public state. */
export function buildReadSources(namespace: string) {
    const prefix = resourceRuntimeNamespace(`${namespace}/fixture-collection-fixture`);
    return Array.from({ length: 64 }, (_unused, index) => {
        const id = `${prefix}--build-${index}`;
        const example = `build-${index}`;
        return [
            {
                path: `blocs/${id}/definition.json`,
                content: JSON.stringify({
                    kind: "component",
                    id,
                    label: "bloc.label",
                    description: "bloc.label",
                    categories: ["bloc.label"],
                    examples: [example],
                    defaultExample: example,
                    root: { accepts: ["div"] },
                    slots: { body: { accepts: [{ kind: "native-content", profile: "prose" }] } },
                    uses: [],
                    requires: [],
                }),
            },
            { path: `blocs/${id}/markup.html`, content: '<section><slot name="body"></slot></section>' },
            {
                path: `blocs/${id}/style.css`,
                content: Array.from(
                    { length: 64 },
                    (_value, rule) => `.build-${index}-${rule}{padding:${rule}px}`,
                ).join("\n"),
            },
            {
                path: `examples/${example}/definition.json`,
                content: JSON.stringify({
                    id: example,
                    label: "bloc.label",
                    description: "bloc.label",
                    previews: [{ id: "desktop", frame: { width: 640, height: 240 } }],
                }),
            },
            {
                path: `examples/${example}/document.html`,
                content: `<div cms-bloc="${id}"><p slot="body">Build ${index}</p></div>`,
            },
        ];
    }).flat();
}
