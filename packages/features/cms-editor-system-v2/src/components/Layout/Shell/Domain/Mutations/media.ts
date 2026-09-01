import type { MediaAccept } from "@bernouy/cms-content/editor";

import {
    FilesCenter,
    type FilesCenterSelectDetail,
    type FilesCenterSelectManyDetail,
} from "../../../../Controls/Pickers/FilesCenter/FilesCenter";
import { parseInlineSvg } from "./Content/inlineSvg";

export function openMediaPicker(
    frameDocument: Document | null,
    accept: MediaAccept[] | undefined,
    options: { multiple?: boolean; maxSelection?: number },
    onSelect: (elements: HTMLElement[]) => void,
): void {
    const center = new FilesCenter();
    const cleanup = () => center.remove();
    center.addEventListener("close", cleanup, { once: true });
    center.addEventListener(
        "select-file",
        async (event) => {
            const detail = (event as CustomEvent<FilesCenterSelectDetail>).detail;
            const element = await createMediaElement(frameDocument, detail, accept);
            if (!element) {
                return;
            }
            onSelect([element]);
        },
        { once: true },
    );
    center.addEventListener(
        "select-files",
        async (event) => {
            const detail = (event as CustomEvent<FilesCenterSelectManyDetail>).detail;
            const resolved = await Promise.all(
                detail.files.map((file) => createMediaElement(frameDocument, file, accept)),
            );
            const elements = resolved.filter((element): element is HTMLElement => Boolean(element));
            onSelect(elements);
        },
        { once: true },
    );

    document.body.append(center);
    center.show({
        accept: ["folder", "file"],
        fileAccept: accept ?? ["image"],
        multiple: options.multiple === true,
        maxSelection: options.maxSelection,
    });
}

async function createMediaElement(
    document: Document | null,
    detail: FilesCenterSelectDetail,
    accept: MediaAccept[] | undefined,
): Promise<HTMLElement | null> {
    if (!document) {
        return null;
    }

    if (accept?.includes("svg") && normalizedMimeType(detail.mimeType) === "image/svg+xml") {
        try {
            const response = await fetch(detail.src);
            if (!response.ok) {
                return null;
            }
            return parseInlineSvg(document, await response.text());
        } catch {
            return null;
        }
    }

    if (detail.mimeType?.startsWith("image/") ?? true) {
        const image = document.createElement("img");
        image.setAttribute("src", detail.src);
        image.setAttribute("alt", detail.label);
        image.addEventListener(
            "load",
            () => {
                if (image.naturalWidth > 0) {
                    image.setAttribute("width", String(image.naturalWidth));
                }
                if (image.naturalHeight > 0) {
                    image.setAttribute("height", String(image.naturalHeight));
                }
            },
            { once: true },
        );
        return image;
    }

    if (detail.mimeType?.startsWith("video/")) {
        const video = document.createElement("video");
        video.setAttribute("src", detail.src);
        video.setAttribute("controls", "");
        return video;
    }

    if (detail.mimeType?.startsWith("audio/")) {
        const audio = document.createElement("audio");
        audio.setAttribute("src", detail.src);
        audio.setAttribute("controls", "");
        return audio;
    }

    const link = document.createElement("a");
    link.setAttribute("href", detail.src);
    link.textContent = detail.label;
    return link;
}

function normalizedMimeType(mimeType: string | undefined): string {
    return mimeType?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}
