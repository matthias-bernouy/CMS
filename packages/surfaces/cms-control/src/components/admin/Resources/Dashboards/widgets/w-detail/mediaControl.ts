import type { WDetailField } from "./types";
import "../w-media-field/WMediaField";
import type { DashboardMediaItem } from "../w-media-field/types";

type MediaControl = HTMLElement & { items: DashboardMediaItem[] };

export function mediaList(field: WDetailField): HTMLElement {
    const input = document.createElement("cms-dashboard-w-media-field") as MediaControl;
    input.setAttribute("label", field.label);
    input.toggleAttribute("required", field.required === true);
    input.setAttribute("accept", field.accept ?? "image/*");
    input.toggleAttribute("multiple", field.multiple === true);
    input.items = mediaValue(field.value);
    input.dataset.fieldControl = field.id;
    return input;
}

export function isMediaControl(control: HTMLElement): control is MediaControl {
    return "items" in control && Array.isArray((control as MediaControl).items);
}

function mediaValue(value: WDetailField["value"]): DashboardMediaItem[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.filter(
        (item): item is DashboardMediaItem => Boolean(item) && typeof item === "object" && "url" in item,
    );
}
