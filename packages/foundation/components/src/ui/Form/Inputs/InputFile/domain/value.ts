import { formatSize, announce } from "../compute";
import { emitChange } from "../emit";

export const updateFileValue = (
    host: HTMLElement,
    input: HTMLInputElement | null,
    preview: HTMLElement | null,
    liveRegion: HTMLElement | null,
    internals: ElementInternals,
) => {
    const files = input?.files;
    if (!files || files.length === 0) {
        if (preview) {
            preview.textContent = "No file selected";
        }
        internals.setFormValue(null);
        announce(liveRegion, "No file selected");
        emitChange(host, null);
        return;
    }

    const summary =
        files.length === 1 && files[0]
            ? `${files[0].name} (${formatSize(files[0].size)})`
            : `${files.length} files selected`;

    if (preview) {
        preview.textContent = summary;
    }

    if (files.length === 1 && files[0]) {
        internals.setFormValue(files[0]);
    } else {
        const data = new FormData();
        const name = host.getAttribute("name") ?? "";
        for (let i = 0; i < files.length; i++) {
            const file = files.item(i);
            if (file) {
                data.append(name, file);
            }
        }
        internals.setFormValue(data);
    }

    announce(liveRegion, `Selected: ${summary}`);
    emitChange(host, files);
};
