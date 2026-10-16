import { BlocBehavior } from "@bernouy/cms-content/browser";

const OPTIONAL_REGIONS = ["breadcrumb", "actions", "description", "navigation", "footer"] as const;

export class Bloc extends BlocBehavior {
    constructor(root: HTMLElement) {
        super(root);
    }

    override connectedCallback(): void {
        this.sync();
    }

    private readonly sync = (): void => {
        for (const name of OPTIONAL_REGIONS) {
            const region = this?.querySelector<HTMLElement>('[part="' + name + '"]');
            if (region) {
                region.hidden = !Array.from(region.childNodes).some(hasMeaningfulContent);
            }
        }
    };
}

function hasMeaningfulContent(node: Node): boolean {
    if (node.nodeType === Node.TEXT_NODE) {
        return Boolean(node.textContent?.trim());
    }
    if (!(node instanceof Element)) {
        return false;
    }
    if (node.hasAttribute("cms-bloc") || node.matches("a, button, input, select, textarea, img, svg, video, audio")) {
        return true;
    }
    return Array.from(node.childNodes).some(hasMeaningfulContent);
}
