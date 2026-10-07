const USER_FACING_TEXT_ATTRIBUTES = new Set([
    "abbr",
    "alt",
    "aria-braillelabel",
    "aria-brailleroledescription",
    "aria-description",
    "aria-label",
    "aria-placeholder",
    "aria-roledescription",
    "aria-valuetext",
    "label",
    "placeholder",
    "title",
]);

/** Attributes whose value is copy rather than an identifier, URL or machine value. */
export function isUserFacingTextAttribute(element: string, attribute: string, inputType = ""): boolean {
    if (USER_FACING_TEXT_ATTRIBUTES.has(attribute)) {
        return true;
    }
    return element === "input" && attribute === "value" && ["button", "reset", "submit"].includes(inputType);
}
