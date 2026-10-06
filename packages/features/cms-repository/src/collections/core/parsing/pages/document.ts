import { parseStrictJson } from "cms-repository/exports/contracts/protocol";
import { DomUtils, parseDocument } from "htmlparser2";
import type { CollectionPageSurface } from "../../../interfaces/CollectionPage";
import { invalid } from "../../errors";
import { string } from "../../values";
import { PAGE_ATTRIBUTES, PAGE_INPUT_TYPES, PAGE_TAGS } from "./elements";
import { validateStablePageLink } from "./references";
const IDENTIFIER = "[a-z][a-z0-9]*(?:[.-][a-z][a-z0-9]*)*";
const CUSTOM_ATTRIBUTE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const CONTROL_CHARACTER = /[\u0000-\u001F\u007F]/u;
const FORM_NAME = /^[A-Za-z_][A-Za-z0-9_.:-]{0,127}$/u;
const SOURCE_RELOAD = /^#[A-Za-z][A-Za-z0-9_.:-]{0,127}$/u;
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
            if (!PAGE_TAGS.has(node.name) && !blocIds.has(node.name)) {
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
        if (CONTROL_CHARACTER.test(value)) {
            invalid(`Page attribute ${name} contains control characters`, path);
        }
        const customBlocAttribute =
            blocIds.has(tag) &&
            CUSTOM_ATTRIBUTE.test(name) &&
            !name.startsWith("on") &&
            !["is", "style"].includes(name);
        if (!PAGE_ATTRIBUTES.has(name) && !name.startsWith("aria-") && name !== "slot" && !customBlocAttribute) {
            invalid(`unsupported Page attribute ${name}`, path);
        }
        if (name === "type" && tag === "button" && value !== "button" && value !== "submit") {
            invalid("Page buttons must be buttons or controlled form submitters", path);
        }
        if (name === "type" && tag === "input" && !PAGE_INPUT_TYPES.has(value)) {
            invalid("Page input type is not controlled", path);
        }
        if (name === "name" && !FORM_NAME.test(value)) {
            invalid("Page form control name is invalid", path);
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
        if (name === "cms-source-trigger" && !["auto", "submit", "change"].includes(value)) {
            invalid("Page source trigger is not controlled", path);
        }
        if (name === "cms-source-serialization" && value !== "typed-json") {
            invalid("Page source serialization must be typed-json", path);
        }
        if (name === "cms-source-success-reload" && !SOURCE_RELOAD.test(value)) {
            invalid("Page source success reload must identify one source by #id", path);
        }
        if (name === "cms-source-success-reset" && value !== "true" && value !== "false") {
            invalid("Page source reset behavior must be true or false", path);
        }
        if (name === "cms-form-value-type" && !["string", "number", "boolean"].includes(value)) {
            invalid("Page form value type is not controlled", path);
        }
        if (name === "cms-form-empty" && value !== "null" && value !== "omit") {
            invalid("Page form empty behavior is not controlled", path);
        }
    }
    validateStablePageLink(tag, attributes, path);
    if (attributes["cms-source"] && attributes["cms-source-method"]?.toUpperCase() !== "POST") {
        invalid("Page capability sources must declare POST", path);
    }
    if (tag === "form" && attributes["cms-source"]) {
        if (attributes["cms-source-trigger"] !== "submit" && attributes["cms-source-trigger"] !== "change") {
            invalid("Page capability forms must declare a submit or change trigger", path);
        }
    }
    if (tag !== "form" && attributes["cms-source-success-reload"] !== undefined) {
        invalid("Page source success reload requires a form", path);
    }
    if (!attributes["cms-source"] && attributes["cms-source-trigger"] !== undefined) {
        invalid("Page source trigger requires a capability source", path);
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
