import type { RichTextBarExtension, Field } from "cms-control/core/editorSystem/extensions/types";
import { ICON_BRACES } from "cms-control/components/icons";

/** The single, generic `{ }` button rendered on the bar when ≥1 extension is
 *  scoped at the caret. The popover (built by `buildGroup`) opens below it. */
export function buildBraceButton(onClick: (anchor: HTMLElement) => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ext-btn";
    btn.title = "Insert dynamic content";
    btn.innerHTML = ICON_BRACES;
    btn.addEventListener("mousedown", (e) => { e.preventDefault(); });
    btn.addEventListener("click",     (e) => { e.stopPropagation(); onClick(btn); });
    return btn;
}

/** One section of the popover, scoped to a single extension. The header shows
 *  the extension's icon (if provided) + label; rows below are the fields it
 *  exposes via `getCompletions()`. */
export function buildGroup(ext: RichTextBarExtension, onPickField: (field: Field) => void): HTMLElement {
    const group = document.createElement("div");
    group.className = "ext-group";

    const header = document.createElement("div");
    header.className = "ext-group-header";
    if (ext.icon) header.insertAdjacentHTML("afterbegin", `<span class="ext-group-icon">${ext.icon}</span>`);
    const lbl = document.createElement("span");
    lbl.className = "ext-group-label";
    lbl.textContent = ext.label();
    header.appendChild(lbl);
    group.appendChild(header);

    const fields = ext.getCompletions();
    if (fields.length === 0) {
        const empty = document.createElement("div");
        empty.className = "ext-empty";
        empty.textContent = "No fields";
        group.appendChild(empty);
    } else {
        for (const f of fields) group.appendChild(buildRow(f, onPickField));
    }
    return group;
}

function buildRow(field: Field, onPick: (field: Field) => void): HTMLButtonElement {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "ext-row";
    row.innerHTML = `<span class="ext-row-label"></span><span class="ext-row-path"></span>`;
    (row.querySelector(".ext-row-label") as HTMLElement).textContent = field.label;
    (row.querySelector(".ext-row-path")  as HTMLElement).textContent = field.path;
    row.addEventListener("mousedown", (e) => { e.preventDefault(); });
    row.addEventListener("click",     (e) => { e.stopPropagation(); onPick(field); });
    return row;
}
