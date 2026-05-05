import { buildOptionList, type PageRef } from "../PageLink.picker";
import { isMedia } from "../detect";
import type { PageLink, LinkMode } from "../PageLink";

export function applyMode(host: PageLink) {
    const r = host._refs, m = host._mode;
    r.pageSection.style.display = m === "page" ? "" : "none";
    r.externalSection.style.display = m === "external" ? "" : "none";
    r.mediaSection.style.display = m === "media" ? "" : "none";
    r.tabPage.classList.toggle("active", m === "page");
    r.tabExternal.classList.toggle("active", m === "external");
    r.tabMedia.classList.toggle("active", m === "media");
}

export function setMode(host: PageLink, m: LinkMode) {
    host._mode = m;
    applyMode(host);
    if (m === "external") requestAnimationFrame(() => host._refs.externalInput.focus());
}

export function refresh(host: PageLink, pages: PageRef[]) {
    host._options = buildOptionList(host._refs.list, host._refs.empty, pages, p => select(host, p.path, p.title));
    host._options.forEach(li => li.classList.toggle("selected", li.dataset.value === host._value));
}

export function select(host: PageLink, v: string, label: string) {
    setValue(host, v, label);
    closePanel(host);
    host.dispatchEvent(new Event("change", { bubbles: true }));
}

export function setValue(host: PageLink, v: string, label: string) {
    host._value = v;
    const r = host._refs;
    r.display.textContent = v ? label : "No link";
    r.trigger.classList.toggle("has-value", !!v);
    r.clearBtn.style.display = v ? "flex" : "none";
    host._options.forEach(li => li.classList.toggle("selected", li.dataset.value === v));
    const m = isMedia(v);
    r.mediaCurrent.textContent = m ? v : "";
    r.mediaCurrent.classList.toggle("has-value", m);
}

export function openPanel(host: PageLink) {
    document.querySelectorAll("p9r-link, p9r-select").forEach(el => {
        if (el !== host && "_close" in el) (el as any)._close();
    });
    host._isOpen = true;
    host._refs.panel.classList.add("open");
    host._refs.trigger.classList.add("open");
    host._refs.search.value = "";
    refresh(host, host._pages);
    requestAnimationFrame(() => {
        if (host._mode === "page") host._refs.search.focus();
        else if (host._mode === "external") host._refs.externalInput.focus();
    });
}

export function closePanel(host: PageLink) {
    host._isOpen = false;
    host._refs.panel.classList.remove("open");
    host._refs.trigger.classList.remove("open");
}
