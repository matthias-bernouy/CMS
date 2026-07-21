import { getPanels, nextTabId } from "../compute";
import { emitChange } from "../emit";

export const rebuildTabs = (host: HTMLElement, tablist: HTMLElement | null, slot: HTMLSlotElement | null) => {
    if (!tablist) {
        return;
    }
    tablist.innerHTML = "";
    const panels = getPanels(slot);
    let activeId = host.getAttribute("active");
    if (!activeId && panels.length > 0) {
        activeId = panels[0]?.getAttribute("id") ?? null;
    }

    panels.forEach((panel, i) => {
        const id = panel.getAttribute("id") ?? nextTabId();
        if (!panel.id) {
            panel.id = id;
        }
        const labelAttr = panel.getAttribute("label") ?? `Tab ${i + 1}`;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "tab";
        btn.setAttribute("part", "tab");
        btn.setAttribute("role", "tab");
        btn.setAttribute("id", `tab-${id}`);
        btn.setAttribute("aria-controls", id);
        btn.dataset.target = id;
        btn.textContent = labelAttr;
        if (panel.hasAttribute("disabled")) {
            btn.setAttribute("disabled", "");
        }
        tablist.appendChild(btn);

        panel.setAttribute("role", "tabpanel");
        panel.setAttribute("aria-labelledby", `tab-${id}`);
    });

    if (activeId) {
        activateTab(host, tablist, slot, activeId);
    }
};

export const activateTab = (
    host: HTMLElement,
    tablist: HTMLElement | null,
    slot: HTMLSlotElement | null,
    id: string,
) => {
    const panels = getPanels(slot);
    const tabs = Array.from(tablist?.querySelectorAll<HTMLButtonElement>(".tab") ?? []);
    let matched = false;

    panels.forEach((p) => {
        const isMatch = p.id === id;
        if (isMatch) {
            matched = true;
        }
        p.toggleAttribute("hidden", !isMatch);
    });

    tabs.forEach((t) => {
        const isMatch = t.dataset.target === id;
        t.setAttribute("aria-selected", String(isMatch));
        t.setAttribute("tabindex", isMatch ? "0" : "-1");
    });

    if (matched && host.getAttribute("active") !== id) {
        host.setAttribute("active", id);
        emitChange(host, id);
    }
};
