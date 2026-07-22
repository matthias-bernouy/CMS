import { intAttr, buildItems } from "../compute";

export const renderPagination = (
    host: HTMLElement,
    pages: HTMLElement | null,
    prev: HTMLButtonElement | null,
    next: HTMLButtonElement | null,
) => {
    if (!pages) {
        return;
    }
    const page = intAttr(host, "page", 1);
    const total = intAttr(host, "total", 1);
    const siblings = intAttr(host, "siblings", 1);
    const boundary = intAttr(host, "boundary", 1);

    pages.innerHTML = "";
    for (const item of buildItems(page, total, siblings, boundary)) {
        if (item === "…") {
            const span = document.createElement("span");
            span.className = "ellipsis";
            span.setAttribute("part", "ellipsis");
            span.textContent = "…";
            pages.appendChild(span);
        } else {
            const li = document.createElement("li");
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "page";
            btn.setAttribute("part", "page");
            btn.dataset.page = String(item);
            btn.textContent = String(item);
            if (item === page) {
                btn.setAttribute("aria-current", "page");
            }
            li.appendChild(btn);
            pages.appendChild(li);
        }
    }

    if (prev) {
        prev.disabled = page <= 1;
    }
    if (next) {
        next.disabled = page >= total;
    }
};
