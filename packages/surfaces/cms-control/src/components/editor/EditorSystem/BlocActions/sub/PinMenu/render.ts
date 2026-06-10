import { ICON_PIN } from "../../../../../icons";
import type { PinMenuRow } from "./PinMenu";

export function renderRow(row: PinMenuRow): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "row";
    btn.innerHTML = `<span class="icon">${ICON_PIN}</span><span class="label"></span>`;
    (btn.querySelector(".label") as HTMLElement).textContent = row.label;
    if (row.isActive) btn.setAttribute("data-active", "");
    btn.addEventListener("click", (e) => { e.stopPropagation(); row.onClick(); });
    return btn;
}
