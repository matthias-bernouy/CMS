import { DomUtils, parseDocument } from "htmlparser2";
import { parseStrictJson } from "cms-repository/exports/contracts/protocol";
import type { CollectionView } from "../../interfaces/CollectionView";
import { invalid } from "../errors";
import { array, identifier, integer, keys, record, string, unique } from "../values";

const TAGS = new Set([
    "article",
    "aside",
    "b",
    "br",
    "button",
    "div",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "header",
    "li",
    "main",
    "nav",
    "ol",
    "p",
    "section",
    "small",
    "span",
    "strong",
    "ul",
]);
const ATTRIBUTES = new Set([
    "id",
    "title",
    "role",
    "aria-label",
    "aria-live",
    "hidden",
    "type",
    "cms-condition",
    "cms-repeat",
    "cms-source",
    "cms-source-body",
    "cms-source-id",
    "cms-source-method",
]);
const IDENTIFIER = "[a-z][a-z0-9]*(?:[.-][a-z][a-z0-9]*)*";
const SOURCE = new RegExp(`^/\\.cms/call/${IDENTIFIER}/${IDENTIFIER}(?: as [A-Za-z_$][\\w$]*)?$`, "u");

/** A bounded Control fragment with no executable HTML or external navigation. */
export function parseCollectionViews(value: unknown, blocIds: ReadonlySet<string>): readonly CollectionView[] {
    const views = array(value, 32, "$.views").map((entry, index) => {
        const path = `$.views[${index}]`;
        const source = record(entry, path);
        keys(source, ["id", "generation", "name", "icon", "description", "html"], path);
        const id = identifier(source.id, `${path}.id`);
        const html = string(source.html, 64 * 1024, `${path}.html`);
        validateViewHtml(html, blocIds, `${path}.html`);
        return {
            id,
            generation:
                source.generation === undefined
                    ? 1
                    : integer(source.generation, 1, Number.MAX_SAFE_INTEGER, `${path}.generation`),
            name: string(source.name, 128, `${path}.name`),
            ...(source.icon === undefined ? {} : { icon: identifier(source.icon, `${path}.icon`) }),
            ...(source.description === undefined
                ? {}
                : { description: string(source.description, 4096, `${path}.description`) }),
            html,
        };
    });
    unique(
        views.map((view) => view.id),
        "$.views",
    );
    return views.sort((a, b) => a.id.localeCompare(b.id));
}

function validateViewHtml(html: string, blocIds: ReadonlySet<string>, path: string): void {
    const document = parseDocument(html, { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true });
    const pending = [...document.children];
    while (pending.length > 0) {
        const node = pending.pop()!;
        if (DomUtils.isTag(node)) {
            if (!TAGS.has(node.name) && !blocIds.has(node.name)) {
                invalid(`unsupported view element ${node.name}`, path);
            }
            for (const [name, value] of Object.entries(node.attribs)) {
                if (!ATTRIBUTES.has(name) && !name.startsWith("aria-") && name !== "slot") {
                    invalid(`unsupported view attribute ${name}`, path);
                }
                if (name === "type" && value !== "button") {
                    invalid("view buttons must be inert", path);
                }
                if (name === "cms-source" && !SOURCE.test(value)) {
                    invalid("view sources must use a canonical CMS capability", path);
                }
                if (name === "cms-source-method" && value.toUpperCase() !== "POST") {
                    invalid("view capability sources must use POST", path);
                }
                if (name === "cms-source-body" && !isJsonObject(value)) {
                    invalid("view source body must be a JSON object", path);
                }
            }
            if (node.attribs["cms-source"] && node.attribs["cms-source-method"]?.toUpperCase() !== "POST") {
                invalid("view capability sources must declare POST", path);
            }
            pending.push(...node.children);
        } else if (node.type !== "text") {
            invalid("unsupported view node", path);
        }
    }
}

function isJsonObject(value: string): boolean {
    try {
        const parsed = parseStrictJson(value, 64 * 1024, 16);
        return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
    } catch {
        return false;
    }
}
