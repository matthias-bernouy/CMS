import { parseHTML } from "linkedom";

/** Construct complete examples for small test models, independently of release parsing. */
export function collectionFixture(source: any): any {
    const original = source.blocs ?? [];
    const byId = new Map<string, any>(original.map((bloc: any) => [bloc.id, bloc]));
    const examples = [...(source.examples ?? [])].filter(
        (example) =>
            !example.id.endsWith("-example") ||
            original.some((bloc: any) => bloc.catalogue !== "hidden" && bloc.defaultExample === example.id),
    );
    const definitions = original.map((bloc: any) => {
        const { exampleContent: _exampleContent, ...definition } = bloc;
        if (definition.catalogue !== "hidden" && definition.defaultExample === undefined) {
            const id = definition.id + "-example";
            definition.examples = [id];
            definition.defaultExample = id;
            examples.push({
                id,
                label: definition.label,
                description: definition.description ?? definition.label,
                document: { html: instance(bloc, new Set()) },
                previews: [{ id: "default", frame: { width: 640, height: 240 } }],
            });
        }
        return definition;
    });
    return { ...source, blocs: definitions, examples };

    function instance(bloc: any, seen: Set<string>, slot = ""): string {
        const { document } = parseHTML("<html><body></body></html>");
        const root = document.createElement(bloc.root?.accepts?.[0] ?? "div");
        root.setAttribute("cms-bloc", bloc.id);
        if (slot && slot !== "default") {
            root.setAttribute("slot", slot);
        }
        for (const [key, value] of Object.entries(bloc.root?.defaults ?? {})) {
            root.setAttribute(key, String(value));
        }
        for (const setting of bloc.settings ?? []) {
            if (setting.default !== false) {
                root.setAttribute(setting.id, setting.default === true ? "" : String(setting.default));
            }
        }
        if (seen.has(bloc.id)) {
            return root.outerHTML;
        }
        const visited = new Set([...seen, bloc.id]);
        if (bloc.exampleContent !== undefined) {
            root.innerHTML = bloc.exampleContent;
        } else {
            for (const [name, value] of Object.entries(bloc.slots ?? {})) {
                const declaration = value as any;
                for (let i = 0; i < (declaration.min ?? 0); i++) {
                    const accepted = declaration.accepts?.[0];
                    if (accepted?.kind === "component" && byId.has(accepted.tag)) {
                        root.innerHTML += instance(byId.get(accepted.tag), visited, name);
                    } else {
                        const child = document.createElement(
                            accepted?.kind === "native-element"
                                ? accepted.accepts[0]
                                : accepted?.profile === "prose" || !accepted
                                  ? "p"
                                  : "span",
                        );
                        if (name && name !== "default") {
                            child.setAttribute("slot", name);
                        }
                        for (const [key, value] of Object.entries(accepted?.defaults ?? {})) {
                            child.setAttribute(key, String(value));
                        }
                        for (const [key, value] of Object.entries(accepted?.attributes ?? {})) {
                            const constraint = value as any;
                            if (constraint.required) {
                                child.setAttribute(
                                    key,
                                    constraint.values?.[0] ?? (key === "src" ? "{{ cms.files.fixture.1 }}" : "example"),
                                );
                            }
                        }
                        if (child.localName === "img") {
                            child.setAttribute("alt", "Example image");
                        }
                        if (!child.hasAttribute("href") && child.localName === "a") {
                            child.setAttribute("href", "/example");
                        }
                        if (!["input", "img", "svg"].includes(child.localName)) {
                            child.textContent = "Example";
                        }
                        root.append(child);
                    }
                }
            }
        }
        return root.outerHTML;
    }
}
