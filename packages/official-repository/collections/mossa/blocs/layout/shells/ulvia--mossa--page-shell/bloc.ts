import { createBlocScope } from "@bernouy/cms-content/browser";

const OPTIONAL_REGIONS = ["breadcrumb", "actions", "description", "navigation", "footer"] as const;

class Controller {
    private readonly scope: ReturnType<typeof createBlocScope>;
    private readonly observer: MutationObserver;

    constructor(private readonly blocRoot: HTMLElement) {
        this.scope = createBlocScope(this.blocRoot);
        this.observer = new MutationObserver(this.sync);
    }

    connect(): void {
        this.sync();
        this.observer.observe(this.blocRoot, {
            childList: true,
            characterData: true,
            subtree: true,
        });
    }

    disconnect(): void {
        this.observer.disconnect();
    }

    private readonly sync = (): void => {
        for (const name of OPTIONAL_REGIONS) {
            const region = this.scope.querySelector<HTMLElement>('[part="' + name + '"]');
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

export function mount(root: HTMLElement): void | (() => void) {
    const controller = new Controller(root);
    controller.connect();
    return () => controller.disconnect();
}
