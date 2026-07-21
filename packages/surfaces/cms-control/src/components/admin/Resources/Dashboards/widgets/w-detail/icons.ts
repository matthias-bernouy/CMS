import type { WidgetAction } from "../shared";

const SVG_NS = "http://www.w3.org/2000/svg";
const PATHS: Record<NonNullable<WidgetAction["icon"]>, string[]> = {
    archive: ["M3 7h18", "M5 7l1 14h12l1-14", "M9 11h6"],
    download: ["M12 3v12", "m7 10 5 5 5-5", "M5 21h14"],
    link: [
        "M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0-7.07-7.07l-.91.91",
        "M14 11a5 5 0 0 0-7.07 0l-1.41 1.41a5 5 0 0 0 7.07 7.07l.91-.91",
    ],
    trash: ["M3 6h18", "M8 6V4h8v2", "M19 6l-1 14H6L5 6", "M10 11v6", "M14 11v6"],
};

export function actionIcon(icon: WidgetAction["icon"]): SVGSVGElement | null {
    if (!icon) {
        return null;
    }
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("slot", "icon");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("focusable", "false");
    for (const data of PATHS[icon]) {
        const path = document.createElementNS(SVG_NS, "path");
        path.setAttribute("d", data);
        svg.append(path);
    }
    return svg;
}
