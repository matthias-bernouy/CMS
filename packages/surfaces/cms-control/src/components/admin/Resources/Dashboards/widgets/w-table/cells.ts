import type { WTableCell } from "./types";

export function cellText(cell: WTableCell | undefined): string {
    if (!cell) return "";
    return typeof cell === "string" ? cell : [cell.title, cell.meta ?? ""].filter(Boolean).join(" ");
}

export function appendTableCellValue(target: HTMLElement, cell: WTableCell | undefined, primary: boolean): void {
    if (!cell) return;
    if (typeof cell === "string") {
        target.textContent = cell;
        return;
    }

    if (cell.tone === "badge") {
        const badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = cell.title;
        target.append(badge);
        return;
    }

    const wrap = document.createElement("span");
    wrap.className = primary ? "cell-primary" : "cell-stack";

    const title = document.createElement(primary ? "strong" : "span");
    title.textContent = cell.title;
    wrap.append(title);

    if (cell.meta) {
        const meta = document.createElement("small");
        meta.textContent = cell.meta;
        wrap.append(meta);
    }

    if (cell.tone === "muted") wrap.classList.add("muted");
    target.append(wrap);
}
