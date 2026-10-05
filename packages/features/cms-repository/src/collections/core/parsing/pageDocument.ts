import { parseStrictJson } from "cms-repository/exports/contracts/protocol";
import { DomUtils, parseDocument } from "htmlparser2";
import type { CollectionPageSurface } from "../../interfaces/CollectionPage";
import { invalid } from "../errors";
import { string } from "../values";

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

export function validatePageHtml(
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
                invalid(`unsupported Page element ${node.name}`, path);
            }
            if (blocIds.has(node.name)) {
                blocs.add(node.name);
            }
            validateAttributes(node.name, node.attribs, blocIds, calls, path);
            pending.push(...node.children);
        } else if (node.type !== "text") {
            invalid("unsupported Page node", path);
        }
    }
    return { blocs, calls };
}

export function parseSurface(value: unknown, path: string): CollectionPageSurface {
    if (value !== "control" && value !== "delivery") {
        return invalid("must be control or delivery", path);
    }
    return value;
}

export function parseDefaultPath(value: unknown, surface: CollectionPageSurface, path: string): string {
    const route = string(value, 512, path);
    if (
        !route.startsWith("/") ||
        route.includes("?") ||
        route.includes("#") ||
        route.includes("\\") ||
        route.includes("//") ||
        route.split("/").some((segment) => segment === "." || segment === "..")
    ) {
        return invalid("must be a normalized absolute path without query or fragment", path);
    }
    const controlPath = route === "/admin" || route.startsWith("/admin/");
    if ((surface === "control") !== controlPath) {
        return invalid(
            surface === "control" ? "Control Pages must use /admin paths" : "Delivery Pages cannot use /admin paths",
            path,
        );
    }
    if (
        surface === "delivery" &&
        ["/.cms", "/api", "/assets", "/auth", "/login"].some(
            (prefix) => route === prefix || route.startsWith(`${prefix}/`),
        )
    ) {
        return invalid("Delivery Page path is reserved by the runtime", path);
    }
    return route;
}

function validateAttributes(
    tag: string,
    attributes: Readonly<Record<string, string>>,
    blocIds: ReadonlySet<string>,
    calls: Set<string>,
    path: string,
): void {
    for (const [name, value] of Object.entries(attributes)) {
        const customBlocAttribute =
            blocIds.has(tag) &&
            CUSTOM_ATTRIBUTE.test(name) &&
            !name.startsWith("on") &&
            !["is", "style"].includes(name);
        if (!ATTRIBUTES.has(name) && !name.startsWith("aria-") && name !== "slot" && !customBlocAttribute) {
            invalid(`unsupported Page attribute ${name}`, path);
        }
        if (name === "type" && tag === "button" && value !== "button") {
            invalid("Page buttons must be inert", path);
        }
        if (name === "cms-source") {
            const match = SOURCE.exec(value);
            if (!match?.groups) {
                invalid("Page sources must use a canonical CMS capability", path);
            }
            calls.add(`${match.groups.contract}/${match.groups.capability}`);
        }
        if (name === "cms-source-method" && value.toUpperCase() !== "POST") {
            invalid("Page capability sources must use POST", path);
        }
        if (name === "cms-source-body" && !isJsonObject(value)) {
            invalid("Page source body must be a JSON object", path);
        }
    }
    if (attributes["cms-source"] && attributes["cms-source-method"]?.toUpperCase() !== "POST") {
        invalid("Page capability sources must declare POST", path);
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
