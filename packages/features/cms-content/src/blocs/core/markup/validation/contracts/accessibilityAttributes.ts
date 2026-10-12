import { isConcreteAriaRole } from "cms-content/blocs/core/markup/validation/contracts/accessibilityRoles";

const TOKENS: Readonly<Record<string, ReadonlySet<string>>> = {
    "aria-atomic": new Set(["true", "false"]),
    "aria-autocomplete": new Set(["none", "inline", "list", "both"]),
    "aria-busy": new Set(["true", "false"]),
    "aria-checked": new Set(["true", "false", "mixed", "undefined"]),
    "aria-current": new Set(["page", "step", "location", "date", "time", "true", "false"]),
    "aria-disabled": new Set(["true", "false"]),
    "aria-expanded": new Set(["true", "false", "undefined"]),
    "aria-haspopup": new Set(["false", "true", "menu", "listbox", "tree", "grid", "dialog"]),
    "aria-hidden": new Set(["true", "false", "undefined"]),
    "aria-invalid": new Set(["false", "true", "grammar", "spelling"]),
    "aria-live": new Set(["off", "polite", "assertive"]),
    "aria-modal": new Set(["true", "false"]),
    "aria-multiline": new Set(["true", "false"]),
    "aria-multiselectable": new Set(["true", "false"]),
    "aria-orientation": new Set(["horizontal", "vertical", "undefined"]),
    "aria-pressed": new Set(["true", "false", "mixed", "undefined"]),
    "aria-readonly": new Set(["true", "false"]),
    "aria-required": new Set(["true", "false"]),
    "aria-selected": new Set(["true", "false", "undefined"]),
    "aria-sort": new Set(["none", "ascending", "descending", "other"]),
};

const TEXT = new Set([
    "aria-braillelabel",
    "aria-brailleroledescription",
    "aria-colindextext",
    "aria-description",
    "aria-keyshortcuts",
    "aria-label",
    "aria-placeholder",
    "aria-roledescription",
    "aria-rowindextext",
    "aria-valuetext",
]);
const ID = "[A-Za-z][A-Za-z0-9_.:-]*";
const SINGLE_ID = new RegExp(`^${ID}$`, "u");
const ID_LIST = new RegExp(`^${ID}(?:\\s+${ID})*$`, "u");
const SINGLE_ID_ATTRIBUTES = new Set(["aria-activedescendant", "aria-details", "aria-errormessage"]);
const ID_LIST_ATTRIBUTES = new Set([
    "aria-controls",
    "aria-describedby",
    "aria-flowto",
    "aria-labelledby",
    "aria-owns",
]);
const POSITIVE_INTEGER_ATTRIBUTES = new Set([
    "aria-colindex",
    "aria-colspan",
    "aria-level",
    "aria-posinset",
    "aria-rowindex",
    "aria-rowspan",
]);
const SIGNED_INTEGER_ATTRIBUTES = new Set(["aria-colcount", "aria-rowcount", "aria-setsize"]);
const NUMBER_ATTRIBUTES = new Set(["aria-valuemax", "aria-valuemin", "aria-valuenow"]);

/** Returns undefined when the attribute is not accessibility-related. */
export function implementationAccessibilityAttributeIssue(name: string, value: string): string | null | undefined {
    if (name === "role") {
        const roles = value.trim().split(/\s+/u);
        return roles.length > 0 && roles.every(isConcreteAriaRole)
            ? null
            : 'attribute "role" must contain only concrete WAI-ARIA roles';
    }
    if (!name.startsWith("aria-")) {
        return undefined;
    }
    const controlled = TOKENS[name];
    if (controlled) {
        return controlled.has(value) ? null : `attribute "${name}" has an uncontrolled ARIA value`;
    }
    if (TEXT.has(name)) {
        return value.trim() ? null : `attribute "${name}" must not be empty`;
    }
    if (SINGLE_ID_ATTRIBUTES.has(name)) {
        return SINGLE_ID.test(value) ? null : `attribute "${name}" must reference one valid id`;
    }
    if (ID_LIST_ATTRIBUTES.has(name)) {
        return ID_LIST.test(value) ? null : `attribute "${name}" must reference valid ids`;
    }
    if (POSITIVE_INTEGER_ATTRIBUTES.has(name)) {
        return /^[1-9]\d*$/u.test(value) ? null : `attribute "${name}" must be a positive integer`;
    }
    if (SIGNED_INTEGER_ATTRIBUTES.has(name)) {
        return value === "-1" || /^(?:0|[1-9]\d*)$/u.test(value)
            ? null
            : `attribute "${name}" must be -1 or a non-negative integer`;
    }
    if (NUMBER_ATTRIBUTES.has(name)) {
        return value.trim() && Number.isFinite(Number(value)) ? null : `attribute "${name}" must be a finite number`;
    }
    if (name === "aria-relevant") {
        const tokens = new Set(value.trim().split(/\s+/u));
        const allowed = new Set(["additions", "removals", "text"]);
        return tokens.size > 0 &&
            ([...tokens].every((token) => allowed.has(token)) || (tokens.size === 1 && tokens.has("all")))
            ? null
            : 'attribute "aria-relevant" has an uncontrolled ARIA value';
    }
    return `attribute "${name}" is not a supported ARIA attribute`;
}
