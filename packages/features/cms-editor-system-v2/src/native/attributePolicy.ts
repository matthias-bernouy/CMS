import {
    CMS_BINDING_ATTRIBUTES,
    isCmsMediaSource,
    isNativeHtmlTag,
    isPlatformNativeAttributeAllowed,
    isSafeNavigationalUrl,
    nativeBindingAttributeIssue,
    nativeAttributeSetIssue,
    nativeAttributeValueIssue,
    parseSource,
    type Setting,
    type SettingControl,
    type SettingSection,
} from "@bernouy/cms-content/editor";

const SYSTEM_GENERATED_ATTRIBUTES = new Set<string>(Object.values(CMS_BINDING_ATTRIBUTES));
const NATIVE_MUTABLE_BINDING_ATTRIBUTES: Readonly<Record<string, ReadonlySet<string>>> = {
    form: new Set([
        CMS_BINDING_ATTRIBUTES.source,
        CMS_BINDING_ATTRIBUTES.sourceBody,
        CMS_BINDING_ATTRIBUTES.sourceMethod,
        CMS_BINDING_ATTRIBUTES.sourceSuccessRedirect,
        CMS_BINDING_ATTRIBUTES.sourceSuccessReset,
        CMS_BINDING_ATTRIBUTES.sourceTrigger,
    ]),
};

const NON_MUTABLE_NATIVE_ATTRIBUTES = new Set(["slot", "width", "height", "decoding"]);
const EMPTY_VALUE_ATTRIBUTES = new Set(["alt", "disabled"]);

type SettingType = SettingControl["type"];

const ALLOWED_SETTING_TYPES: Readonly<Record<string, Readonly<Record<string, SettingType>>>> = {
    a: { href: "page-link", target: "select", rel: "select" },
    article: { "aria-label": "text" },
    aside: { "aria-label": "text" },
    button: { type: "segmented", disabled: "toggle" },
    footer: { "aria-label": "text" },
    form: {
        [CMS_BINDING_ATTRIBUTES.source]: "endpoint-picker",
        [CMS_BINDING_ATTRIBUTES.sourceSuccessRedirect]: "page-link",
        [CMS_BINDING_ATTRIBUTES.sourceSuccessReset]: "segmented",
        autocomplete: "select",
    },
    header: { "aria-label": "text" },
    img: { src: "page-link", role: "segmented", alt: "text", loading: "select", fetchpriority: "select" },
    main: { "aria-label": "text" },
    nav: { "aria-label": "text" },
    section: { "aria-label": "text" },
    svg: { role: "segmented", "aria-label": "text" },
};

const CONTROLLED_VALUES: Readonly<Record<string, Readonly<Record<string, ReadonlySet<string>>>>> = {
    a: {
        target: new Set(["", "_blank"]),
        rel: new Set([
            "",
            "nofollow",
            "sponsored",
            "ugc",
            "noopener noreferrer",
            "noopener noreferrer nofollow",
            "noopener noreferrer sponsored",
            "noopener noreferrer ugc",
        ]),
    },
    button: { type: new Set(["button", "submit"]) },
    form: {
        [CMS_BINDING_ATTRIBUTES.sourceSuccessReset]: new Set(["true", "false"]),
        autocomplete: new Set(["on", "off"]),
    },
    img: {
        role: new Set(["", "presentation"]),
        loading: new Set(["lazy", "eager"]),
        fetchpriority: new Set(["auto", "high", "low"]),
    },
    svg: { role: new Set(["", "img"]) },
};

export function isNativeHtmlEditorTag(tag: string): boolean {
    return isNativeHtmlTag(tag);
}

export function isNativeEditorAttributeAllowed(tag: string, attribute: string): boolean {
    if (!isNativeHtmlEditorTag(tag)) {
        return true;
    }
    const normalized = attribute.toLowerCase();
    if (attribute !== normalized) {
        return false;
    }
    if (SYSTEM_GENERATED_ATTRIBUTES.has(normalized)) {
        return NATIVE_MUTABLE_BINDING_ATTRIBUTES[tag.toLowerCase()]?.has(normalized) ?? false;
    }
    return isMutableNativeAttribute(tag, normalized);
}

export function isNativeEditorSettingAllowed(target: Element, setting: SettingControl): boolean {
    if (!isNativeHtmlEditorTag(target.localName)) {
        return true;
    }
    const tag = target.localName.toLowerCase();
    const attribute = setting.attribute.toLowerCase();
    if (setting.attribute !== attribute) {
        return false;
    }
    if (ALLOWED_SETTING_TYPES[tag]?.[attribute] !== setting.type) {
        return false;
    }
    const controlled = CONTROLLED_VALUES[tag]?.[attribute];
    if (controlled && (setting.type === "select" || setting.type === "segmented")) {
        return setting.options.length > 0 && setting.options.every((option) => controlled.has(option.value));
    }
    if (setting.type === "page-link") {
        return pageLinkSettingIsControlled(tag, attribute, setting);
    }
    if (setting.type === "endpoint-picker") {
        return (
            tag === "form" &&
            attribute === CMS_BINDING_ATTRIBUTES.source &&
            setting.required === true &&
            setting.methodAttribute === CMS_BINDING_ATTRIBUTES.sourceMethod
        );
    }
    return true;
}

export function isNativeEditorSettingValueAllowed(
    target: Element,
    setting: SettingControl,
    value: string | boolean,
): boolean {
    if (!isNativeHtmlEditorTag(target.localName)) {
        return true;
    }
    if (!isNativeEditorSettingAllowed(target, setting)) {
        return false;
    }
    if (typeof value === "boolean") {
        return setting.type === "toggle" && target.localName === "button" && setting.attribute === "disabled";
    }
    if (setting.required && !value.trim()) {
        return false;
    }

    const tag = target.localName.toLowerCase();
    const attribute = setting.attribute.toLowerCase();
    const controlled = CONTROLLED_VALUES[tag]?.[attribute];
    if (controlled) {
        return controlled.has(value);
    }
    if (setting.type === "page-link") {
        return pageLinkValueAllowed(tag, attribute, value);
    }
    if (setting.type === "endpoint-picker") {
        return parseSource(value) !== null;
    }
    return !/[\u0000-\u001F\u007F]/.test(value);
}

export function isNativeEditorAttributeValueAllowed(
    tag: string,
    attribute: string,
    value: string | boolean | null,
): boolean {
    if (!isNativeHtmlEditorTag(tag) || value === null) {
        return true;
    }
    const normalizedAttribute = attribute.toLowerCase();
    if (typeof value === "boolean") {
        return tag.toLowerCase() === "button" && normalizedAttribute === "disabled";
    }
    if (value === "" && normalizedAttribute !== "alt" && normalizedAttribute !== "disabled") {
        return true;
    }
    if (SYSTEM_GENERATED_ATTRIBUTES.has(normalizedAttribute)) {
        return systemAttributeValueAllowed(tag.toLowerCase(), normalizedAttribute, value);
    }
    if (
        (tag.toLowerCase() === "a" && normalizedAttribute === "href") ||
        (tag.toLowerCase() === "img" && normalizedAttribute === "src")
    ) {
        return pageLinkValueAllowed(tag.toLowerCase(), normalizedAttribute, value);
    }
    return nativeAttributeValueIssue(tag, normalizedAttribute, value) === null;
}

export function isNativeEditorAttributeMutationAllowed(
    target: Element,
    changes: Readonly<Record<string, string | boolean | null>>,
): boolean {
    const tag = target.localName.toLowerCase();
    if (!isNativeHtmlEditorTag(tag)) {
        return true;
    }

    const attributes: Record<string, string> = {};
    for (const attribute of Array.from(target.attributes)) {
        const name = attribute.name.toLowerCase();
        if (name === "slot" || isMutableNativeAttribute(tag, name)) {
            attributes[name] = attribute.value;
        }
    }
    for (const [rawName, value] of Object.entries(canonicalizeNativeEditorAttributeChanges(changes))) {
        const name = rawName.toLowerCase();
        if (name !== "slot" && !isMutableNativeAttribute(tag, name)) {
            continue;
        }
        if (value === null || value === false) {
            delete attributes[name];
        } else {
            attributes[name] = value === true ? "" : value;
        }
    }
    return nativeAttributeSetIssue(tag, attributes) === null;
}

export function canonicalizeNativeEditorAttributeChanges(
    changes: Readonly<Record<string, string | boolean | null>>,
): Record<string, string | boolean | null> {
    return Object.fromEntries(
        Object.entries(changes).map(([attribute, value]) => {
            const removesAttribute =
                value === null ||
                value === false ||
                (value === "" && !EMPTY_VALUE_ATTRIBUTES.has(attribute.toLowerCase()));
            return [attribute, removesAttribute ? null : value];
        }),
    );
}

export function filterNativeEditorSettingSections(target: Element, sections: SettingSection[]): SettingSection[] {
    if (!isNativeHtmlEditorTag(target.localName)) {
        return sections;
    }
    return sections.flatMap((section): SettingSection[] => {
        const settings = section.settings.flatMap((setting): Setting[] => filterSetting(target, setting));
        return settings.length > 0 ? [{ ...section, settings }] : [];
    });
}

export function applyNativeEditorAttributeEffects(target: HTMLElement, attribute: string): void {
    if (target.localName !== "img" || attribute.toLowerCase() !== "src") {
        return;
    }
    const image = target as HTMLImageElement;
    image.removeAttribute("width");
    image.removeAttribute("height");
    const applyDimensions = () => {
        if (image.naturalWidth > 0) {
            image.setAttribute("width", String(image.naturalWidth));
        }
        if (image.naturalHeight > 0) {
            image.setAttribute("height", String(image.naturalHeight));
        }
    };
    image.addEventListener("load", applyDimensions, { once: true });
    if (image.complete) {
        applyDimensions();
    }
}

function filterSetting(target: Element, setting: Setting): Setting[] {
    if (setting.type !== "row") {
        return isNativeEditorSettingAllowed(target, setting) ? [setting] : [];
    }
    const settings = setting.settings.filter((child) => isNativeEditorSettingAllowed(target, child));
    return settings.length > 0 ? [{ ...setting, settings }] : [];
}

function pageLinkValueAllowed(tag: string, attribute: string, value: string): boolean {
    if (!value.trim()) {
        return false;
    }
    if (tag === "img" && attribute === "src") {
        return isCmsMediaSource(value);
    }
    if (tag === "form" && attribute === CMS_BINDING_ATTRIBUTES.sourceSuccessRedirect) {
        return nativeBindingAttributeIssue(attribute, value) === null;
    }
    return isSafeNavigationalUrl(value);
}

function pageLinkSettingIsControlled(
    tag: string,
    attribute: string,
    setting: Extract<SettingControl, { type: "page-link" }>,
): boolean {
    if (tag === "img" && attribute === "src") {
        return (
            setting.required === true &&
            setting.allowPage === false &&
            setting.allowExternal === false &&
            setting.allowMedia === true &&
            setting.mediaAccept?.length === 1 &&
            setting.mediaAccept[0] === "image"
        );
    }
    if (tag === "form" && attribute === CMS_BINDING_ATTRIBUTES.sourceSuccessRedirect) {
        return setting.allowExternal === false && setting.allowMedia === false;
    }
    return tag === "a" && attribute === "href" && setting.required === true;
}

function systemAttributeValueAllowed(tag: string, attribute: string, value: string): boolean {
    if (tag !== "form") {
        return false;
    }
    if (attribute === CMS_BINDING_ATTRIBUTES.source) {
        return nativeBindingAttributeIssue(attribute, value) === null;
    }
    if (attribute === CMS_BINDING_ATTRIBUTES.sourceMethod) {
        return ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(value);
    }
    if (attribute === CMS_BINDING_ATTRIBUTES.sourceTrigger) {
        return value === "submit";
    }
    if (attribute === CMS_BINDING_ATTRIBUTES.sourceSuccessReset) {
        return nativeBindingAttributeIssue(attribute, value) === null;
    }
    if (attribute === CMS_BINDING_ATTRIBUTES.sourceSuccessRedirect) {
        return nativeBindingAttributeIssue(attribute, value) === null;
    }
    if (attribute === CMS_BINDING_ATTRIBUTES.sourceBody) {
        return value === "" || nativeBindingAttributeIssue(attribute, value) === null;
    }
    return false;
}

function isMutableNativeAttribute(tag: string, attribute: string): boolean {
    return !NON_MUTABLE_NATIVE_ATTRIBUTES.has(attribute) && isPlatformNativeAttributeAllowed(tag, attribute);
}
