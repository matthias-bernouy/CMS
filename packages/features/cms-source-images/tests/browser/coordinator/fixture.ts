import {
    createResponsiveSourceImageBrowserApi,
    installBoundImageRuntime,
    type BoundImageRuntime,
} from "@bernouy/cms-source-images/browser-host";

export function createRoot(): HTMLElement {
    return document.createElement("section");
}

export function image(attributes: Record<string, string> = {}): HTMLImageElement {
    const element = document.createElement("img");
    for (const [name, value] of Object.entries(attributes)) {
        element.setAttribute(name, value);
    }
    return element;
}

export function install(root: Document | Element, rollout = { public: true, private: true }): BoundImageRuntime {
    return installBoundImageRuntime(root, createResponsiveSourceImageBrowserApi(rollout));
}

export async function settle(): Promise<void> {
    for (let turn = 0; turn < 2; turn += 1) {
        await Promise.resolve();
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    await Promise.resolve();
}
