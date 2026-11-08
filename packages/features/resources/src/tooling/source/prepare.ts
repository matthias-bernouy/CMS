import { z } from "zod";
import type { ThemeSource } from "@bernouy/content";
import type { ResolvedContract } from "@bernouy/ulvia-contracts";
import { parseInlineSvgAsset } from "@bernouy/content/page-document";
import { deepFreeze } from "@bernouy/ulvia-contracts/protocol";
import type { PreparedResourceSource } from "../interfaces";
import { captureResourceSource, sourceJson, sourceText } from "./tree";
import { definitionSchema, translations } from "./metadata";
import { compileSourceBlocs } from "./blocs";
import { materializeStateSchemas } from "../state/references";
import { resourceStates } from "../state/schemas";
import { sourceTexts, sourcePages } from "./records";
import { mediaTypeFor } from "./records";

/** Build-only source capture: no installation catalogue, services, executors or authored JavaScript execution. */
export async function prepareResourceSource(
    directory: string,
    contracts: readonly ResolvedContract[],
): Promise<PreparedResourceSource> {
    const files = await captureResourceSource(directory);
    const definition = definitionSchema.parse(sourceJson(files, "definition.json"));
    const allowed = new Set(["blocs", "pages", "translations", "texts", "theme", "assets", "examples"]);
    for (const path of files.keys()) {
        if (path !== "definition.json" && !allowed.has(path.split("/")[0]!)) {
            throw new TypeError("Unknown resource source entry: " + path);
        }
    }
    const catalogues = translations(files);
    const fallback = catalogues[definition.locale];
    if (!fallback) {
        throw new TypeError("Resource translations must include the source default locale");
    }
    for (const messages of Object.values(catalogues)) {
        if (Object.keys(messages).some((key) => !Object.hasOwn(fallback, key))) {
            throw new TypeError("Translated keys must exist in the source default locale");
        }
    }
    const states = resourceStates(await materializeStateSchemas(definition.states, contracts));
    const blocs = await compileSourceBlocs(files, definition.namespace);
    const assets: PreparedResourceSource["assets"][number][] = [];
    for (const [path, bytes] of files) {
        if (!path.startsWith("assets/")) {
            continue;
        }
        const id = path.slice(7);
        if (!id.split("/").every((part) => /^[a-z0-9][a-z0-9._-]*$/u.test(part) && part !== "." && part !== "..")) {
            throw new TypeError("Invalid source asset path");
        }
        const mediaType = mediaTypeFor(id);
        let inline = false;
        if (mediaType === "image/svg+xml") {
            try {
                parseInlineSvgAsset(bytes);
                inline = true;
            } catch {
                /* Rich SVG stays a download. */
            }
        }
        assets.push({
            id,
            mediaType,
            bytes: new Blob([new Uint8Array(bytes)]),
            ...(inline ? { profiles: ["inline-svg"] as const } : {}),
        });
    }
    if (assets.length > 512) {
        throw new RangeError("Resource source asset count exceeded");
    }
    const theme = files.has("theme/definition.json")
        ? (sourceJson(files, "theme/definition.json") as ThemeSource)
        : null;
    const texts = sourceTexts(files);
    const pages = sourcePages(files);
    const examples = [...files]
        .filter(([path]) => /^examples\/.+\/document\.html$/u.test(path))
        .map(([path, bytes]) => ({ path, html: sourceText(bytes) }));
    // Source-only validation documents are retained in the prepared snapshot, never imported as runtime state.
    const snapshot = {
        namespace: definition.namespace,
        locale: definition.locale,
        states,
        translations: catalogues,
        blocs,
        theme,
        texts,
        pages,
        assets,
        examples,
    };
    z.array(z.string()).max(64).parse(Object.keys(snapshot.translations));
    return deepFreeze(snapshot);
}
