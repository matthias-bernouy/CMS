import type { MediaItem } from "../../types";
import type { DetailMedia } from "../../../DetailMedia/DetailMedia";
import { buildPreview, buildFields, buildActions } from "./builders";

type DetailCallbacks = {
    onSave: (id: string, data: Record<string, string>) => void;
    onDelete: (id: string) => void;
    onClose: () => void;
};

export function setupDetail(detail: DetailMedia, callbacks: DetailCallbacks) {
    detail.addEventListener("close", () => callbacks.onClose());

    return {
        open(item: MediaItem) {
            detail.innerHTML = "";

            const preview = buildPreview(item);
            if (preview) detail.appendChild(preview);

            const fields = buildFields(item);
            detail.appendChild(fields);

            const actions = buildActions();
            detail.appendChild(actions);

            actions.querySelector("#btn-save")!.addEventListener("click", () => {
                callbacks.onSave(item.id, readFields(detail));
            });
            actions.querySelector("#btn-delete")!.addEventListener("click", () => {
                callbacks.onDelete(item.id);
            });
            fields.addEventListener("keydown", (e) => {
                if ((e as KeyboardEvent).key === "Enter") {
                    e.preventDefault();
                    callbacks.onSave(item.id, readFields(detail));
                }
            });

            detail.open(item.label);
        }
    };
}

function readFields(detail: DetailMedia): Record<string, string> {
    const labelInput = detail.querySelector("#detail-label") as HTMLInputElement;
    const altInput = detail.querySelector("#detail-alt") as HTMLTextAreaElement | null;
    const data: Record<string, string> = { label: labelInput.value };
    if (altInput) data.alt = altInput.value;
    return data;
}
