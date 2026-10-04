import { DomUtils, parseDocument } from "htmlparser2";
import { parseStrictJson } from "cms-repository/exports/contracts/protocol";
import type { CollectionView } from "../../interfaces/CollectionView";
import { invalid } from "../errors";
import type { CollectionLimits } from "../limits";
import { array, identifier, integer, keys, record, string, unique } from "../values";
import { parseRequirements } from "./requirements";

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
const CUSTOM_ATTRIBUTE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const SOURCE = new RegExp(
    `^/\\.cms/call/(?<contract>${IDENTIFIER})/(?<capability>${IDENTIFIER})(?: as [A-Za-z_$][\\w$]*)?$`,
    "u",
);

/** A bounded Control fragment with no executable HTML or external navigation. */
export function parseCollectionViews(
    value: unknown,
    blocIds: ReadonlySet<string>,
    limits: Readonly<CollectionLimits>,
): readonly CollectionView[] {
    const views = array(value, limits.maxViews, "$.views").map((entry, index) => {
        const path = `$.views[${index}]`;
        const source = record(entry, path);
        keys(source, ["id", "generation", "name", "icon", "description", "requires", "uses", "html"], path);
        const id = identifier(source.id, `${path}.id`);
        const html = string(source.html, 64 * 1024, `${path}.html`);
        const structure = validateViewHtml(html, blocIds, `${path}.html`);
        const uses = [...structure.blocs].sort();
        if (source.uses !== undefined) {
            const declared = array(source.uses, limits.maxBlocs, `${path}.uses`).map((item, itemIndex) =>
                string(item, 128, `${path}.uses[${itemIndex}]`),
            );
            unique(declared, `${path}.uses`);
            if (declared.sort().join("\0") !== uses.join("\0")) {
                invalid("must exactly match the blocs referenced by view HTML", `${path}.uses`);
            }
        }
        const requires = parseRequirements(source.requires, `${path}.requires`, limits);
        const declaredCalls = new Set(requires.map((item) => `${item.contractId}/${item.capabilityId}`));
        if (
            declaredCalls.size !== structure.calls.size ||
            [...structure.calls].some((call) => !declaredCalls.has(call))
        ) {
            invalid("must exactly match the capabilities called by view HTML", `${path}.requires`);
        }
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
            uses,
            requires,
            html,
        };
    });
    unique(
        views.map((view) => view.id),
        "$.views",
    );
    return views.sort((a, b) => a.id.localeCompare(b.id));
}

function validateViewHtml(
    html: string,
    blocIds: ReadonlySet<string>,
    path: string,
): { blocs: ReadonlySet<string>; calls: ReadonlySet<string> } {
    const document = parseDocument(html, { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true });
    const blocs = new Set<string>();
    const calls = new Set<string>();
    const pending = [...document.children];
    while (pending.length > 0) {
        const node = pending.pop()!;
        if (DomUtils.isTag(node)) {
            if (!TAGS.has(node.name) && !blocIds.has(node.name)) {
                invalid(`unsupported view element ${node.name}`, path);
            }
            if (blocIds.has(node.name)) {
                blocs.add(node.name);
            }
            for (const [name, value] of Object.entries(node.attribs)) {
                const customBlocAttribute =
                    blocIds.has(node.name) &&
                    CUSTOM_ATTRIBUTE.test(name) &&
                    !name.startsWith("on") &&
                    !["is", "style"].includes(name);
                if (!ATTRIBUTES.has(name) && !name.startsWith("aria-") && name !== "slot" && !customBlocAttribute) {
                    invalid(`unsupported view attribute ${name}`, path);
                }
                if (name === "type" && node.name === "button" && value !== "button") {
                    invalid("view buttons must be inert", path);
                }
                if (name === "cms-source") {
                    const match = SOURCE.exec(value);
                    if (!match?.groups) {
                        invalid("view sources must use a canonical CMS capability", path);
                    }
                    calls.add(`${match.groups.contract}/${match.groups.capability}`);
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
    return { blocs, calls };
}

function isJsonObject(value: string): boolean {
    try {
        const parsed = parseStrictJson(value, 64 * 1024, 16);
        return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
    } catch {
        return false;
    }
}
