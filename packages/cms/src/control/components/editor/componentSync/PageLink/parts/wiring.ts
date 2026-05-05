import { filterPages } from "../PageLink.picker";
import { mediaLabel } from "../detect";
import { openMediaCenter } from "./flows";
import { applyMode, closePanel, refresh, select, setMode, setValue } from "./controller";
import type { PageLink } from "../PageLink";

export function wire(host: PageLink) {
    const r = host._refs;
    const fire = () => host.dispatchEvent(new Event("change", { bubbles: true }));

    r.search.addEventListener("input", () => refresh(host, filterPages(host._pages, r.search.value)));
    r.clearBtn.addEventListener("click", e => { e.stopPropagation(); select(host, "", "No link"); });
    r.tabPage.addEventListener("click", e => { e.stopPropagation(); setMode(host, "page"); });
    r.tabExternal.addEventListener("click", e => { e.stopPropagation(); setMode(host, "external"); });
    r.tabMedia.addEventListener("click", e => { e.stopPropagation(); setMode(host, "media"); });

    r.externalInput.addEventListener("input", () => {
        const url = r.externalInput.value.trim();
        setValue(host, url, url || "No link");
        fire();
    });
    r.externalInput.addEventListener("keydown", e => {
        if (e.key === "Enter") { e.preventDefault(); closePanel(host); }
        else if (e.key === "Escape") closePanel(host);
    });

    r.mediaPickBtn.addEventListener("click", e => {
        e.stopPropagation();
        openMediaCenter(host, src => { setValue(host, src, mediaLabel(src)); fire(); });
    });

    applyMode(host);
}
