import { parse, walk } from "css-tree";

const FORBIDDEN = /:host\b|::slotted\b|:global\b/u;
const NESTED_BLOC_SELECTOR = /\[cms-bloc\b/u;
const COLLECTION_ASSET_URL =
    /^\{\{\s*cms\.asset\.[a-z][a-z0-9-]*\.[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)*\s*\}\}$/u;

/** Validate authored CSS and close it around one Light DOM Bloc boundary. */
export function compileBlocStyle(id: string, source: string): string {
    let ast: ReturnType<typeof parse>;
    try {
        ast = parse(source, { context: "stylesheet", positions: true });
    } catch (error) {
        throw new Error(`Invalid CSS for Bloc ${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (FORBIDDEN.test(source) || NESTED_BLOC_SELECTOR.test(source)) {
        throw new Error(`Bloc ${id} CSS must stay inside its Light DOM boundary`);
    }
    walk(ast, (node) => {
        if (node.type === "Atrule") {
            const name = node.name.toLowerCase();
            if (["import", "namespace", "scope", "keyframes", "-webkit-keyframes"].includes(name)) {
                throw new Error(`Bloc ${id} CSS cannot declare @${name}`);
            }
        }
        if (node.type === "PseudoClassSelector" && node.name.toLowerCase() === "root") {
            throw new Error(`Bloc ${id} CSS cannot use :root`);
        }
        if (node.type === "TypeSelector" && ["html", "body", "head"].includes(node.name.toLowerCase())) {
            throw new Error(`Bloc ${id} CSS cannot address document elements`);
        }
        if (node.type === "Url" && !COLLECTION_ASSET_URL.test(node.value)) {
            throw new Error(`Bloc ${id} CSS URLs must use immutable collection assets`);
        }
        if (node.type === "Declaration" && ["animation", "animation-name"].includes(node.property.toLowerCase())) {
            throw new Error(`Bloc ${id} CSS animations require a future namespaced animation contract`);
        }
    });
    return source.trim()
        ? `@layer ulvia.blocks {\n@scope ([cms-bloc="${id}"]) to (:scope [cms-bloc]) {\n${source.trim()}\n}\n}`
        : "";
}
