import type { TopBarViewport } from "../../TopBar/TopBar";
import type { Canvas } from "../../Canvas/Canvas";
import type { TopBar } from "../../TopBar/TopBar";
import type { ViewportMap } from "./shellTypes";

export const VIEWPORTS: ViewportMap = {
    desktop: {
        label:  "Desktop",
        width:  1440,
        height: 900,
        padding: "normal",
        fit:    "fixed",
    },
    tablet: {
        label:  "Tablet",
        width:  768,
        height: 900,
        padding: "normal",
        fit:    "fixed",
    },
    mobile: {
        label:  "Mobile",
        width:  390,
        height: 844,
        padding: "normal",
        fit:    "fixed",
    },
    full: {
        label:  "Full",
        width:  "100%",
        height: "100%",
        padding: "normal",
        fit:    "fluid",
    },
    bleed: {
        label:  "Bleed",
        width:  "100%",
        height: "100%",
        padding: "none",
        fit:    "fluid",
    },
};

export function syncViewport(canvas: Canvas, topBar: TopBar, viewportName: TopBarViewport): void {
    const viewport = VIEWPORTS[viewportName];
    canvas.setAttribute("viewport-width", String(viewport.width));
    canvas.setAttribute("viewport-height", String(viewport.height));
    canvas.setAttribute("viewport-padding", viewport.padding);
    canvas.setAttribute("viewport-fit", viewport.fit);
    topBar.viewport = viewportName;
}
