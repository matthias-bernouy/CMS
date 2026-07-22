import { FilesCenter, type FilesCenterSelectDetail } from "../FilesCenter/FilesCenter";

export function openPageLinkMediaPicker(onSelect: (source: string, label: string) => void): void {
    const center = new FilesCenter();
    const cleanup = () => center.remove();
    center.addEventListener("close", cleanup, { once: true });
    center.addEventListener(
        "select-file",
        (event) => {
            const detail = (event as CustomEvent<FilesCenterSelectDetail>).detail;
            if (detail?.src) {
                onSelect(detail.src, detail.label);
            }
        },
        { once: true },
    );
    document.body.append(center);
    center.show({ accept: ["folder", "file"] });
}
