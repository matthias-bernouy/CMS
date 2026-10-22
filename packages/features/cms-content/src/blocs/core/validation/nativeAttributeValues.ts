import { isSafeNavigationalUrl, normalizeInternalUrl } from "cms-content/blocs/core/markup/security/safeUrl";
import { interpolationExpressions } from "cms-content/blocs/core/markup/bindings/operation";
import { parseBindingExpression } from "cms-content/blocs/core/markup/expression/parser";
import { boundAttributeValueIssue } from "cms-content/blocs/core/markup/validation/contracts/attributeBindings";
import { implementationAccessibilityAttributeIssue } from "cms-content/blocs/core/markup/validation/contracts/accessibilityAttributes";
import { nativeAttributeBindingKind } from "cms-content/blocs/core/validation/nativeHtml";

const DYNAMIC_TOKEN = /(?:\{\{|#\{|@\{)/;
const CONTROL_CHARACTER = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const POSITIVE_INTEGER = /^[1-9]\d*$/;
const INPUT_TYPES = new Set([
    "checkbox",
    "color",
    "date",
    "datetime-local",
    "email",
    "file",
    "hidden",
    "month",
    "number",
    "password",
    "radio",
    "range",
    "search",
    "tel",
    "text",
    "time",
    "url",
    "week",
]);
const ARIA_CURRENT_VALUES = new Set(["page", "step", "location", "date", "time", "true", "false"]);
const ARIA_LIVE_VALUES = new Set(["off", "polite", "assertive"]);
const NATIVE_DIALOG_COMMANDS = new Set(["show-modal", "close"]);
const SAFE_IFRAME_SANDBOX_TOKENS = new Set([
    "allow-downloads",
    "allow-forms",
    "allow-modals",
    "allow-popups",
    "allow-same-origin",
    "allow-scripts",
]);
const STATIC_ELEMENT_ID = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/u;

const SAME_TAB_REL = new Set(["", "nofollow", "sponsored", "ugc"]);
const NEW_TAB_REL = new Set([
    "noopener noreferrer",
    "noopener noreferrer nofollow",
    "noopener noreferrer sponsored",
    "noopener noreferrer ugc",
]);

export function nativeAttributeValueIssue(tag: string, attribute: string, value: string): string | null {
    const normalizedTag = tag.toLowerCase();
    const normalizedAttribute = attribute.toLowerCase();
    const contributedAssetUrl =
        isContributedAssetSource(value) &&
        ((normalizedTag === "a" && normalizedAttribute === "href") ||
            (normalizedTag === "img" && normalizedAttribute === "src"));
    if (normalizedTag === "a" && normalizedAttribute === "href" && DYNAMIC_TOKEN.test(value) && !contributedAssetUrl) {
        return dynamicInternalHrefIssue(value);
    }
    if (normalizedTag === "iframe" && normalizedAttribute === "src" && DYNAMIC_TOKEN.test(value)) {
        return dynamicPageUrlIssue(value);
    }
    if (DYNAMIC_TOKEN.test(value) && isRuntimeBoundNativeAttribute(normalizedTag, normalizedAttribute)) {
        const issue = boundAttributeValueIssue(value, nativeAttributeBindingKind(normalizedAttribute));
        return issue === undefined ? `attribute "${attribute}" only accepts {{ expression }} bindings` : issue;
    }
    if ((DYNAMIC_TOKEN.test(value) && !contributedAssetUrl) || CONTROL_CHARACTER.test(value)) {
        return `attribute "${attribute}" must be a static value without control characters`;
    }
    if (normalizedAttribute === "slot") {
        return /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value)
            ? null
            : "native slot placement must target a named custom-element slot";
    }
    if (normalizedAttribute === "form") {
        return STATIC_ELEMENT_ID.test(value) ? null : `attribute "${attribute}" must reference one static valid id`;
    }

    if (normalizedAttribute === "aria-label") {
        return value.trim() ? null : `attribute "${attribute}" must not be empty`;
    }
    if (normalizedAttribute === "aria-current") {
        return ARIA_CURRENT_VALUES.has(value) ? null : "native aria-current value is not controlled";
    }
    if (normalizedAttribute === "aria-live") {
        return ARIA_LIVE_VALUES.has(value) ? null : "native aria-live value is not controlled";
    }
    if (normalizedAttribute.startsWith("aria-") && normalizedTag !== "img" && normalizedTag !== "svg") {
        return implementationAccessibilityAttributeIssue(normalizedAttribute, value) ?? null;
    }
    if (normalizedTag === "a" && normalizedAttribute === "href") {
        return contributedAssetUrl || isSafeNavigationalUrl(value)
            ? null
            : "native link destination uses a forbidden URL scheme";
    }
    if (normalizedTag === "a" && normalizedAttribute === "target") {
        return value === "_blank" ? null : 'native link target must be "_blank" or omitted';
    }
    if (normalizedTag === "a" && normalizedAttribute === "rel") {
        return SAME_TAB_REL.has(value) || NEW_TAB_REL.has(value) ? null : "native link relationship is not controlled";
    }
    if (normalizedTag === "button" && normalizedAttribute === "type") {
        return ["button", "submit", "reset"].includes(value)
            ? null
            : 'native button type must be "button", "submit" or "reset"';
    }
    if (normalizedTag === "button" && normalizedAttribute === "disabled") {
        return value === "" ? null : "native disabled is a boolean attribute";
    }
    if (normalizedTag === "button" && normalizedAttribute === "command") {
        return NATIVE_DIALOG_COMMANDS.has(value) ? null : 'native button command must be "show-modal" or "close"';
    }
    if (normalizedTag === "button" && normalizedAttribute === "commandfor") {
        return STATIC_ELEMENT_ID.test(value) ? null : "native button commandfor must reference one static valid id";
    }
    if (normalizedTag === "input" && normalizedAttribute === "type") {
        return INPUT_TYPES.has(value) ? null : "native input type is not controlled";
    }
    if (normalizedTag === "input" && normalizedAttribute === "role") {
        return value === "switch" ? null : 'native input role must be "switch" or omitted';
    }
    if (normalizedTag === "form" && normalizedAttribute === "autocomplete") {
        return value === "on" || value === "off" ? null : 'native form autocomplete must be "on" or "off"';
    }
    if (normalizedTag === "iframe") {
        return iframeAttributeIssue(normalizedAttribute, value);
    }
    if (normalizedTag === "img") {
        return imageAttributeIssue(normalizedAttribute, value);
    }
    if (normalizedTag === "svg") {
        return svgAttributeIssue(normalizedAttribute, value);
    }
    return null;
}

export function dynamicInternalHrefIssue(value: string): string | null {
    if (CONTROL_CHARACTER.test(value) || value.includes("#{") || value.includes("@{")) {
        return "dynamic native links require controlled interpolation";
    }
    const expressions = interpolationExpressions(value);
    if (!expressions) {
        return "dynamic native link interpolation is invalid";
    }
    if (/^\s*\{\{\s*[\w$.-]+\s*\|\s*internalUrl\s*\}\}\s*$/u.test(value)) {
        try {
            const node = parseBindingExpression(expressions[0]!);
            return node.kind === "filter" && node.name === "internalUrl" && !node.argument
                ? null
                : "dynamic native links require a valid internalUrl filter";
        } catch {
            return "dynamic native link interpolation is invalid";
        }
    }
    const firstToken = value.indexOf("{{");
    const query = value.indexOf("?");
    const fragment = value.indexOf("#");
    const dynamicBoundary = query === -1 ? fragment : fragment === -1 ? query : Math.min(query, fragment);
    if (!value.startsWith("/") || value.startsWith("//") || dynamicBoundary === -1 || firstToken < dynamicBoundary) {
        return "dynamic native links require a static same-site path";
    }
    try {
        for (const expression of expressions) {
            const node = parseBindingExpression(expression);
            if (node.kind !== "filter" || node.name !== "urlencode" || node.argument) {
                return "dynamic native link values require the urlencode filter";
            }
        }
    } catch {
        return "dynamic native link interpolation is invalid";
    }
    return null;
}

function dynamicPageUrlIssue(value: string): string | null {
    if (CONTROL_CHARACTER.test(value) || value.includes("#{") || value.includes("@{")) {
        return "dynamic native iframe sources require controlled interpolation";
    }
    const expressions = interpolationExpressions(value);
    if (!expressions || expressions.length !== 1 || !/^\s*\{\{.*\}\}\s*$/u.test(value)) {
        return "dynamic native iframe sources require one complete pageUrl binding";
    }
    try {
        const node = parseBindingExpression(expressions[0]!);
        return node.kind === "filter" && node.name === "pageUrl" && !node.argument
            ? null
            : "dynamic native iframe sources require a valid pageUrl filter";
    } catch {
        return "dynamic native iframe source interpolation is invalid";
    }
}

function isRuntimeBoundNativeAttribute(tag: string, attribute: string): boolean {
    return (
        nativeAttributeBindingKind(attribute) === "boolean" ||
        attribute.startsWith("aria-") ||
        (tag === "iframe" && attribute === "title") ||
        attribute === "id" ||
        (tag === "label" && attribute === "for") ||
        (["input", "option", "output", "select", "textarea"].includes(tag) && attribute === "value")
    );
}

export function nativeAttributeSetIssue(tag: string, attributes: Readonly<Record<string, string>>): string | null {
    const normalizedAttributes = Object.fromEntries(
        Object.entries(attributes).map(([attribute, value]) => [attribute.toLowerCase(), value]),
    );
    for (const [attribute, value] of Object.entries(attributes)) {
        const issue = nativeAttributeValueIssue(tag, attribute, value);
        if (issue) {
            return issue;
        }
    }

    const normalizedTag = tag.toLowerCase();
    if (normalizedTag === "a") {
        const target = normalizedAttributes.target;
        const rel = normalizedAttributes.rel ?? "";
        if (target === "_blank" && !NEW_TAB_REL.has(rel)) {
            return 'native links opening a new tab require derived "noopener noreferrer" relationships';
        }
        if (target !== "_blank" && !SAME_TAB_REL.has(rel)) {
            return "same-tab native links cannot retain new-tab relationships";
        }
    }
    if (normalizedTag === "button") {
        const command = normalizedAttributes.command;
        const commandFor = normalizedAttributes.commandfor;
        if ((command === undefined) !== (commandFor === undefined)) {
            return "native button command and commandfor must be declared together";
        }
    }
    if (normalizedTag === "img") {
        const decorative = normalizedAttributes.role === "presentation";
        if (decorative && (normalizedAttributes["aria-hidden"] !== "true" || normalizedAttributes.alt !== "")) {
            return 'decorative native images require role="presentation", aria-hidden="true" and an empty alt';
        }
        if (!decorative && (!normalizedAttributes.alt?.trim() || normalizedAttributes["aria-hidden"] !== undefined)) {
            return "informative native images require non-empty alternative text";
        }
    }
    if (normalizedTag === "iframe") {
        if (!normalizedAttributes.src?.trim()) {
            return "native iframes require a non-empty source";
        }
        const sandbox = normalizedAttributes.sandbox;
        const tokens = sandbox?.trim() ? sandbox.trim().split(/\s+/u) : [];
        if (
            sandbox === undefined ||
            new Set(tokens).size !== tokens.length ||
            tokens.some((token) => !SAFE_IFRAME_SANDBOX_TOKENS.has(token))
        ) {
            return "native iframe sandbox contains an unsupported permission";
        }
        if (!normalizedAttributes.title?.trim()) {
            return "native iframes require a non-empty title";
        }
    }
    if (normalizedTag === "svg") {
        const informative = normalizedAttributes.role === "img";
        if (
            informative &&
            (!normalizedAttributes["aria-label"]?.trim() || normalizedAttributes["aria-hidden"] !== undefined)
        ) {
            return 'informative native SVGs require role="img" and a non-empty accessible label';
        }
        if (
            !informative &&
            (normalizedAttributes["aria-hidden"] !== "true" || normalizedAttributes["aria-label"] !== undefined)
        ) {
            return 'decorative native SVGs require aria-hidden="true" and no accessible label';
        }
    }
    if (
        normalizedTag === "input" &&
        normalizedAttributes.role === "switch" &&
        normalizedAttributes.type !== "checkbox"
    ) {
        return 'native role="switch" requires input type="checkbox"';
    }
    return null;
}

function iframeAttributeIssue(attribute: string, value: string): string | null {
    if (attribute === "src") {
        if (normalizeInternalUrl(value) !== null) {
            return null;
        }
        try {
            const url = new URL(value);
            return url.protocol === "https:" && !url.username && !url.password
                ? null
                : "native iframe source must be a same-site path or an HTTPS URL";
        } catch {
            return "native iframe source must be a same-site path or an HTTPS URL";
        }
    }
    if (attribute === "loading") {
        return value === "lazy" || value === "eager" ? null : 'native iframe loading must be "lazy" or "eager"';
    }
    if (attribute === "referrerpolicy") {
        return ["no-referrer", "same-origin", "strict-origin", "strict-origin-when-cross-origin"].includes(value)
            ? null
            : "native iframe referrer policy is not controlled";
    }
    return null;
}

function imageAttributeIssue(attribute: string, value: string): string | null {
    if (attribute === "src") {
        return isCmsMediaSource(value) || isContributedAssetSource(value)
            ? null
            : "native image source must reference a CMS media item";
    }
    if (attribute === "role") {
        return value === "presentation" ? null : 'native image role must be "presentation" or omitted';
    }
    if (attribute === "aria-hidden") {
        return value === "true" ? null : 'native image aria-hidden must be "true" or omitted';
    }
    if (attribute === "loading") {
        return value === "lazy" || value === "eager" ? null : 'native image loading must be "lazy" or "eager"';
    }
    if (attribute === "fetchpriority") {
        return ["auto", "high", "low"].includes(value) ? null : "native image fetch priority is not controlled";
    }
    if (attribute === "decoding") {
        return ["auto", "async", "sync"].includes(value) ? null : "native image decoding is not controlled";
    }
    if (attribute === "width" || attribute === "height") {
        return POSITIVE_INTEGER.test(value) ? null : `native image ${attribute} must be a positive integer`;
    }
    return null;
}

function svgAttributeIssue(attribute: string, value: string): string | null {
    if (attribute === "role") {
        return value === "img" ? null : 'native SVG role must be "img" or omitted';
    }
    if (attribute === "aria-hidden") {
        return value === "true" ? null : 'native SVG aria-hidden must be "true" or omitted';
    }
    return null;
}

export function isCmsMediaSource(value: string): boolean {
    return (
        value.startsWith("/") &&
        !value.startsWith("//") &&
        !/[\u0000-\u0020\u007F]/.test(value) &&
        /\/\.cms\/call\/ulvia\.cms\.files\/files\/[^/?#]+\/[^/?#]+(?:\/representations\/(?:thumbnail|responsive)\/\d+\.webp)?(?:[?#].*)?$/.test(
            value,
        )
    );
}

export function isContributedAssetSource(value: string): boolean {
    return /^\{\{\s*cms\.asset\.[a-z][a-z0-9-]{0,95}\.[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)*\s*\}\}$/u.test(
        value,
    );
}
