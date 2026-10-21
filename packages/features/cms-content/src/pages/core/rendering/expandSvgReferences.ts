import { parseInlineSvgAsset, type InlineSvgAsset } from "cms-content/blocs/core/markup/security/inlineSvg";
import { CMS_SVG_ATTRIBUTE } from "cms-content/blocs/core/markup/security/svgReference";

const MAX_REFERENCES = 256;
const MAX_UNIQUE_SOURCES = 64;
const MAX_EXPANDED_BYTES = 1024 * 1024;
const MAX_EXPANDED_ELEMENTS = 4_096;
const RESOLUTION_CONCURRENCY = 8;

export async function expandSvgReferences(
    root: Element,
    resolve: (source: string) => Promise<string | Uint8Array>,
): Promise<void> {
    const references = Array.from(root.querySelectorAll(`svg[${CMS_SVG_ATTRIBUTE}]`)).map((element) => {
        const source = element.getAttribute(CMS_SVG_ATTRIBUTE);
        if (!source) {
            throw new Error("Rendered cms-svg reference is empty");
        }
        return { element, source };
    });
    if (references.length > MAX_REFERENCES) {
        throw new Error(`Rendered document exceeds its ${MAX_REFERENCES} cms-svg reference budget`);
    }
    const occurrences = new Map<string, number>();
    for (const { source } of references) {
        occurrences.set(source, (occurrences.get(source) ?? 0) + 1);
    }
    const sources = [...occurrences.keys()];
    if (sources.length > MAX_UNIQUE_SOURCES) {
        throw new Error(`Rendered document exceeds its ${MAX_UNIQUE_SOURCES} unique cms-svg source budget`);
    }
    const fragments = await resolveFragments(sources, occurrences, resolve);
    for (const { element, source } of references) {
        const fragment = fragments.get(source)!;
        element.setAttribute("viewBox", fragment.viewBox);
        for (const [name, value] of Object.entries(fragment.presentation)) {
            element.setAttribute(name, value);
        }
        element.innerHTML = fragment.markup;
        element.removeAttribute(CMS_SVG_ATTRIBUTE);
    }
}

async function resolveFragments(
    sources: readonly string[],
    occurrences: ReadonlyMap<string, number>,
    resolve: (source: string) => Promise<string | Uint8Array>,
): Promise<Map<string, InlineSvgAsset>> {
    const fragments = new Map<string, InlineSvgAsset>();
    let totalBytes = 0;
    let totalElements = 0;
    let cursor = 0;
    const worker = async () => {
        for (;;) {
            const index = cursor++;
            const source = sources[index];
            if (source === undefined) {
                return;
            }
            const fragment = parseInlineSvgAsset(await resolve(source));
            const count = occurrences.get(source)!;
            totalBytes += fragment.byteLength * count;
            totalElements += fragment.elementCount * count;
            if (totalBytes > MAX_EXPANDED_BYTES || totalElements > MAX_EXPANDED_ELEMENTS) {
                throw new Error("Rendered document exceeds its cumulative cms-svg expansion budget");
            }
            fragments.set(source, fragment);
        }
    };
    await Promise.all(Array.from({ length: Math.min(RESOLUTION_CONCURRENCY, sources.length) }, worker));
    return fragments;
}
