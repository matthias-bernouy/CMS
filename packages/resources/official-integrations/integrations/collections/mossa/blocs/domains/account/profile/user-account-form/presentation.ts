import { accountFieldLabels, accountMessages } from "./copy";

type ObjectValue = Record<string, unknown>;

export function accountPresentation(host: HTMLElement, value: unknown, uploadedAvatarFileId: string) {
    const account = objectValue(value) || {};
    const avatarFileId = uploadedAvatarFileId || String(account.avatarFileId || "");
    const presentation: Record<string, unknown> = {
        avatarFileId,
        avatarHint: text(host, "avatar-hint", "JPEG, PNG, WebP, or GIF, up to 5 MiB."),
        avatarUrl: avatarFileId
            ? `/.cms/sources/user-account/getAccountAvatar?fileId=${encodeURIComponent(avatarFileId)}`
            : "",
        birthDateMaximum: currentLocalDate(),
        buttonLabel: text(host, "button-label", "Save"),
        errorToastDuration: text(host, "error-toast-duration", "6000"),
        fieldAppearance: text(host, "field-appearance", "outlined"),
        fieldTone: text(host, "field-tone", "primary"),
        loadingLabel: text(host, "loading-label", "Loading your information"),
        successToastDuration: text(host, "success-toast-duration", "4500"),
        toastDensity: text(host, "toast-density", "regular"),
        toastPosition: text(host, "toast-position", "top-right"),
        toastRadius: text(host, "toast-radius", "md"),
        toastShadow: text(host, "toast-shadow", "none"),
        toastWidth: text(host, "toast-width", "auto"),
    };
    for (const [field, fallback] of Object.entries(accountFieldLabels)) {
        presentation[`${camel(field)}Label`] = text(host, `${field}-label`, fallback);
        presentation[`show${title(camel(field))}`] = host.getAttribute(`show-${field}`) !== "false";
    }
    for (const [name, fallback] of Object.entries(accountMessages)) {
        presentation[camel(name)] = text(host, name, fallback);
    }
    return presentation;
}

function text(host: HTMLElement, attribute: string, fallback: string): string {
    return host.getAttribute(attribute)?.trim() || fallback;
}

function camel(value: string): string {
    return value.replaceAll(/-([a-z0-9])/g, (_match, character: string) => character.toUpperCase());
}

function title(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
}

function currentLocalDate(date = new Date()): string {
    const year = String(date.getFullYear()).padStart(4, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function objectValue(value: unknown): ObjectValue | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as ObjectValue) : null;
}
