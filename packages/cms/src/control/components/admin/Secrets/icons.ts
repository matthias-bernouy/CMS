import { ICON_EYE, ICON_SAVE, ICON_TRASH } from "src/control/components/icons";

/** Resolve `[data-icon="..."]` placeholders inside `root` to inline SVG
 *  markup from the shared icon registry. Keeps SVGs out of HTML templates. */
const ICONS: Record<string, string> = { eye: ICON_EYE, save: ICON_SAVE, trash: ICON_TRASH };

export function injectIcons(root: ParentNode): void {
    root.querySelectorAll<HTMLElement>('[data-icon]').forEach(el => {
        const name = el.dataset.icon!;
        if (ICONS[name]) el.innerHTML = ICONS[name];
    });
}
