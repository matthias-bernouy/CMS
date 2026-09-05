import { isNativeHtmlTag } from "@bernouy/cms-content";

export function isNativeBlocTag(tag: string): boolean {
    return isNativeHtmlTag(tag);
}

export function nativeBlocOwnershipError(tag: string): string {
    return `Native HTML tag "${tag}" is platform-owned and cannot be published or replaced by an integration.`;
}
