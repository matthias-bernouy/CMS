import { parseStrictJson } from "cms-repository/exports/contracts/protocol";
import { DomUtils, parseDocument } from "htmlparser2";
import { invalid } from "../../errors";

const IDENTIFIER = "[a-z][a-z0-9]*(?:[.-][a-z][a-z0-9]*)*";
const CONTROL_CHARACTER = /[\u0000-\u001F\u007F]/u;
const SOURCE_RELOAD = /^#[A-Za-z][A-Za-z0-9_.:-]{0,127}$/u;
const SOURCE = new RegExp(
    `^/\\.cms/call/(?<contract>${IDENTIFIER})/(?<capability>${IDENTIFIER})(?: as [A-Za-z_$][\\w$]*)?$`,
    "u",
);

/** Validates controlled bindings inside a collection Bloc's fixed Light DOM. */
export function validateBlocLightHtml(html: string, path: string): ReadonlySet<string> {
    const calls = new Set<string>();
    const document = parseDocument(html, {
        decodeEntities: true,
        lowerCaseTags: true,
        lowerCaseAttributeNames: true,
    });
    const pending = [...document.children];
    while (pending.length > 0) {
        const node = pending.pop()!;
        if (DomUtils.isTag(node)) {
            validateBindingAttributes(node.name, node.attribs, calls, path);
            pending.push(...node.children);
        } else if (node.type !== "text") {
            invalid("unsupported Bloc light DOM node", path);
        }
    }
    return calls;
}

function validateBindingAttributes(
    tag: string,
    attributes: Readonly<Record<string, string>>,
    calls: Set<string>,
    path: string,
): void {
    for (const [name, value] of Object.entries(attributes)) {
        if (CONTROL_CHARACTER.test(value)) {
            invalid(`Bloc light DOM attribute ${name} contains control characters`, path);
        }
        if (name === "cms-source") {
            const match = SOURCE.exec(value);
            if (!match?.groups) {
                invalid("Bloc sources must use a canonical CMS capability", path);
            }
            calls.add(`${match.groups.contract}/${match.groups.capability}`);
        }
        if (name === "cms-source-body" && !isJsonObject(value)) {
            invalid("Bloc source body must be a JSON object", path);
        }
        if (name === "cms-source-trigger" && !["auto", "submit", "change"].includes(value)) {
            invalid("Bloc source trigger is not controlled", path);
        }
        if (name === "cms-source-serialization" && value !== "typed-json") {
            invalid("Bloc source serialization must be typed-json", path);
        }
        if (name === "cms-source-success-reload" && !SOURCE_RELOAD.test(value)) {
            invalid("Bloc source success reload must identify one source by #id", path);
        }
        if (name === "cms-source-success-reset" && value !== "true" && value !== "false") {
            invalid("Bloc source reset behavior must be true or false", path);
        }
        if (name === "cms-source-inherit-query" && value !== "true" && value !== "false") {
            invalid("Bloc source query inheritance must be true or false", path);
        }
        if (name === "cms-form-value-type" && !["string", "number", "boolean"].includes(value)) {
            invalid("Bloc form value type is not controlled", path);
        }
        if (name === "cms-form-empty" && value !== "null" && value !== "omit") {
            invalid("Bloc form empty behavior is not controlled", path);
        }
    }
    if (tag === "form" && ["action", "formaction", "method", "target"].some((name) => attributes[name] !== undefined)) {
        invalid("Bloc forms cannot publish through native browser transports", path);
    }
    const source = attributes["cms-source"];
    if (source && attributes["cms-source-method"]?.toUpperCase() !== "POST") {
        invalid("Bloc capability sources must declare POST", path);
    }
    if (
        tag === "form" &&
        source &&
        attributes["cms-source-trigger"] !== "submit" &&
        attributes["cms-source-trigger"] !== "change"
    ) {
        invalid("Bloc capability forms must declare a submit or change trigger", path);
    }
    if (tag !== "form" && attributes["cms-source-success-reload"] !== undefined) {
        invalid("Bloc source success reload requires a form", path);
    }
    if (!source && attributes["cms-source-trigger"] !== undefined) {
        invalid("Bloc source trigger requires a capability source", path);
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
