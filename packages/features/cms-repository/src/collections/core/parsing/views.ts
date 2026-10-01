import { DomUtils, parseDocument } from "htmlparser2";
import type { CollectionView } from "../../interfaces/CollectionView";
import { invalid } from "../errors";
import { array, identifier, keys, record, string, unique } from "../values";

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
const ATTRIBUTES = new Set(["id", "title", "role", "aria-label", "aria-live", "hidden", "type"]);

/** A bounded Control fragment with no executable HTML or external navigation. */
export function parseCollectionViews(value: unknown, blocIds: ReadonlySet<string>): readonly CollectionView[] {
    const views = array(value, 32, "$.views").map((entry, index) => {
        const path = `$.views[${index}]`;
        const source = record(entry, path);
        keys(source, ["id", "name", "description", "html"], path);
        const id = identifier(source.id, `${path}.id`);
        const html = string(source.html, 64 * 1024, `${path}.html`);
        validateViewHtml(html, blocIds, `${path}.html`);
        return {
            id,
            name: string(source.name, 128, `${path}.name`),
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
            }
            pending.push(...node.children);
        } else if (node.type !== "text") {
            invalid("unsupported view node", path);
        }
    }
}
