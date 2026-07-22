export function createSourceIcon(sourceId: string): SVGSVGElement {
    return createIcon(sourceIconPaths(sourceId));
}

export function createCategoryIcon(): SVGSVGElement {
    return createIcon('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8"/><path d="M8 13h5"/>');
}

function createIcon(paths: string): SVGSVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("slot", "icon");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.innerHTML = paths;
    return svg;
}

function sourceIconPaths(sourceId: string): string {
    if (sourceId === "colors") {
        return '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7" r=".5" fill="currentColor"/><path d="M12 2a10 10 0 0 0 0 20c.9 0 1.7-.13 2.45-.35 1.1-.33 1.5-1.65.9-2.65-.58-.98-1.35-1.45-1.35-2.4 0-1.1.9-2 2-2h4c1.1 0 2-.9 2-2A10 10 0 0 0 12 2Z"/>';
    }
    if (sourceId === "typography") {
        return '<path d="M4 5V3h16v2"/><path d="M12 3v18"/><path d="M8 21h8"/>';
    }
    if (sourceId === "spacing") {
        return '<path d="M4 6h16"/><path d="M4 12h10"/><path d="M4 18h16"/><path d="M17 9v6"/>';
    }
    return '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 16 16 8"/>';
}
