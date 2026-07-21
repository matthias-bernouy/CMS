import type { SettingIconName } from "@bernouy/cms-content/editor";

const SETTING_ICON_PATHS: Partial<Record<SettingIconName, string>> = {
    "layout-none": `<rect x="8" y="8" width="8" height="8" rx="1.5"></rect>`,
    "layout-column": `<path d="M8 4h8M8 12h8M8 20h8"></path>`,
    "layout-row": `<path d="M4 8v8M12 8v8M20 8v8"></path>`,
    "layout-grid": `<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"></path>`,
    "align-start": `<path d="M5 4v16M9 8h10M9 16h7"></path>`,
    "align-center": `<path d="M12 4v16M6 8h12M8 16h8"></path>`,
    "align-end": `<path d="M19 4v16M5 8h10M8 16h7"></path>`,
    "align-stretch": `<path d="M5 5h14M5 12h14M5 19h14"></path>`,
    "justify-start": `<path d="M4 6h16M8 10v8M16 10v5"></path>`,
    "justify-center": `<path d="M4 12h16M8 6v12M16 8v8"></path>`,
    "justify-end": `<path d="M4 18h16M8 6v8M16 9v5"></path>`,
    "justify-between": `<path d="M4 5h16M8 8v3M16 13v3M4 19h16"></path>`,
    "side-top": `<path d="M5 6h14M8 10h8v8H8z"></path>`,
    "side-right": `<path d="M18 5v14M6 8h8v8H6z"></path>`,
    "side-bottom": `<path d="M5 18h14M8 6h8v8H8z"></path>`,
    "side-left": `<path d="M6 5v14M10 8h8v8h-8z"></path>`,
    "axis-x": `<path d="M4 12h16M7 9l-3 3 3 3M17 9l3 3-3 3"></path>`,
    "axis-y": `<path d="M12 4v16M9 7l3-3 3 3M9 17l3 3 3-3"></path>`,
    "radius": `<path d="M6 18V9a3 3 0 0 1 3-3h9"></path>`,
    "color": `<path d="M12 3s6 6.1 6 11a6 6 0 0 1-12 0c0-4.9 6-11 6-11z"></path>`,
    "visibility": `<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle>`,
    "remove": `<path d="M5 12h14"></path>`,
    "add": `<path d="M12 5v14M5 12h14"></path>`,
    "more": `<path d="M5 12h.01M12 12h.01M19 12h.01"></path>`,
};

export function settingIcon(name: SettingIconName): SVGSVGElement | null {
    const path = SETTING_ICON_PATHS[name];
    if (!path) {
        return null;
    }

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = path;
    return svg;
}
