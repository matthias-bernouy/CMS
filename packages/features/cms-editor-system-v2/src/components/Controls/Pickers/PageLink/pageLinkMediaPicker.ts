import { FilesCenter, type FilesCenterSelectDetail } from "../FilesCenter/FilesCenter";
import type { MediaAccept } from "@bernouy/cms-content/editor";
import { isCmsFileSource, matchesFileAccept } from "../FilesCenter/filesCenterDomain";

export function openPageLinkMediaPicker(
    onSelect: (source: string, label: string) => void,
    accept?: MediaAccept[],
): void {
    const center = new FilesCenter();
    const cleanup = () => center.remove();
    center.addEventListener("close", cleanup, { once: true });
    center.addEventListener(
        "select-file",
        (event) => {
            const detail = (event as CustomEvent<FilesCenterSelectDetail>).detail;
            if (detail?.src && isCmsFileSource(detail.src) && matchesMediaDetail(detail, accept)) {
                onSelect(detail.src, detail.label);
            }
        },
        { once: true },
    );
    document.body.append(center);
    center.show({ accept: ["folder", "file"], fileAccept: accept });
}

function matchesMediaDetail(detail: FilesCenterSelectDetail, accept: MediaAccept[] | undefined): boolean {
    return matchesFileAccept(
        {
            id: detail.id,
            name: detail.label,
            parentId: null,
            type: "file",
            mimeType: detail.mimeType,
        },
        accept ?? null,
    );
}
