import { resourceRuntimeNamespace } from "@bernouy/ulvia-contracts/protocol";
import type { TBlocWrite } from "@bernouy/content";
import { sourceJson, sourceText } from "./tree";
import { buildResourceBloc } from "../runtime/compile";
import { compileBlocStyle } from "resources/artifacts/styles/compile";

export async function compileSourceBlocs(
    files: ReadonlyMap<string, Uint8Array>,
    namespace: string,
): Promise<readonly TBlocWrite[]> {
    const result: TBlocWrite[] = [];
    const roots = [...files.keys()]
        .filter((path) => /^blocs\/.+\/definition\.json$/u.test(path) && !path.endsWith("/settings/definition.json"))
        .map((path) => path.slice(0, -"definition.json".length));
    for (const path of files.keys()) {
        if (!path.startsWith("blocs/")) {
            continue;
        }
        const root = roots.find((root) => path.startsWith(root));
        const suffix = root ? path.slice(root.length) : "";
        if (
            !root ||
            (!["definition.json", "markup.html", "style.css", "bloc.ts", "initial.html"].includes(suffix) &&
                !/^runtime\/.+\.ts$/u.test(suffix))
        ) {
            throw new TypeError("Unknown resource Bloc source entry: " + path);
        }
    }
    for (const path of files.keys()) {
        if (!/^blocs\/.+\/definition\.json$/u.test(path) || path.endsWith("/settings/definition.json")) {
            continue;
        }
        const root = path.slice(0, -"definition.json".length);
        const value = sourceJson(files, path) as TBlocWrite;
        if (
            !value ||
            typeof value !== "object" ||
            typeof value.id !== "string" ||
            root.split("/").at(-2) !== value.id
        ) {
            throw new TypeError("Resource Bloc folders must match their id: " + path);
        }
        if (
            !value.id.startsWith(resourceRuntimeNamespace(namespace) + "--") ||
            !["component", "composition"].includes(value.kind)
        ) {
            throw new TypeError("Invalid namespaced resource Bloc identity or kind");
        }
        const markup = files.get(root + "markup.html");
        if (!markup) {
            throw new TypeError("Resource Bloc requires markup.html: " + path);
        }
        if (
            [
                "viewJS",
                "markupHTML",
                "styleCSS",
                "styleCollectionId",
                "initialDocument",
                "source",
                "defaultContent",
            ].some((key) => Object.hasOwn(value, key))
        ) {
            throw new TypeError("Resource Bloc artifacts must be compiled from separate source files");
        }
        const script = files.get(root + "bloc.ts");
        const style = files.get(root + "style.css");
        const runtimeSources = Object.fromEntries(
            [...files]
                .filter(([key]) => key.startsWith(root + "runtime/"))
                .map(([key, bytes]) => {
                    if (!key.endsWith(".ts")) {
                        throw new TypeError("Bloc runtime sources must be TypeScript");
                    }
                    return [key.slice(root.length), Buffer.from(bytes).toString("base64")];
                }),
        );
        if (value.kind === "composition" && (script || style || Object.keys(runtimeSources).length)) {
            throw new TypeError("Compositions cannot own CSS or runtime code");
        }
        const runtime = script
            ? await buildResourceBloc({
                  tag: value.id,
                  viewSource: sourceText(script),
                  source: runtimeSources,
                  uses: value.uses,
              })
            : null;
        const css = style ? compileBlocStyle(value.id, sourceText(style)) : "";
        const initial = files.get(root + "initial.html");
        result.push({
            ...value,
            markupHTML: sourceText(markup).trim(),
            viewJS: runtime?.viewJS ?? "",
            ownership: { kind: "code-managed" },
            ...(css ? { styleCSS: css, styleCollectionId: namespace } : {}),
            ...(initial ? { initialDocument: { html: sourceText(initial).trim() } } : {}),
        });
    }
    if (result.length > 512 || new Set(result.map(({ id }) => id)).size !== result.length) {
        throw new TypeError("Resource Bloc source count or identity is invalid");
    }
    return result;
}
