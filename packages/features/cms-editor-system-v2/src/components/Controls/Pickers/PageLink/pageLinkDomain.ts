export type LinkMode = "page" | "external" | "media";

export type PageRef = {
    title: string;
    path: string;
};

export type PageLinkModeOptions = {
    allowPage: boolean;
    allowExternal: boolean;
    allowMedia: boolean;
};

export function allowedLinkModes(options: PageLinkModeOptions): LinkMode[] {
    const modes: LinkMode[] = [];
    if (options.allowPage) {
        modes.push("page");
    }
    if (options.allowExternal) {
        modes.push("external");
    }
    if (options.allowMedia) {
        modes.push("media");
    }
    return modes;
}

export function modeForLinkValue(value: string, options: PageLinkModeOptions): LinkMode {
    if (value && isMediaLink(value)) {
        return "media";
    }
    if (value && isExternalLink(value)) {
        return "external";
    }
    if (!options.allowPage && !options.allowExternal && options.allowMedia) {
        return "media";
    }
    if (!options.allowPage && options.allowExternal) {
        return "external";
    }
    return "page";
}

export function isExternalLink(value: string): boolean {
    return /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//");
}

export function isMediaLink(value: string): boolean {
    return value.includes("/.cms/files/by-id/");
}

export function isImageMediaLink(value: string): boolean {
    return /\.(avif|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/i.test(value) || value.includes("/.cms/files/by-id/");
}

export function mediaDisplayName(value: string, isImage: boolean, mediaLabel = ""): string {
    if (mediaLabel) {
        return mediaLabel;
    }
    if (value.includes("/.cms/files/by-id/")) {
        return isImage ? "Image" : "Selected file";
    }

    const clean = value.split(/[?#]/, 1)[0] ?? value;
    const segment = clean.split("/").filter(Boolean).at(-1);
    if (!segment) {
        return "File";
    }

    try {
        return decodeURIComponent(segment);
    } catch {
        return segment;
    }
}

export function mediaSelectionLabel(isImage: boolean): string {
    return isImage ? "Image" : "File selected";
}

export function linkSummaryFallback(mode: LinkMode): string {
    if (mode === "external") {
        return "External URL";
    }
    if (mode === "media") {
        return "File";
    }
    return "Internal page";
}
