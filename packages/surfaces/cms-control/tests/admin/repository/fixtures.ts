import "cms-control/components/admin/Resources/Repository/component/RepositoryAdmin";
import { defaultRepositoryResponse } from "./responses";

export { defaultRepositoryResponse } from "./responses";

const realFetch = globalThis.fetch;

export type RepositoryFetchCall = Readonly<{
    method: string;
    url: URL;
    init: RequestInit | undefined;
}>;

export type RepositoryFetchHandler = (call: RepositoryFetchCall) => Response | Promise<Response>;

export function installRepositoryFetch(handler?: RepositoryFetchHandler): RepositoryFetchCall[] {
    const calls: RepositoryFetchCall[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(input instanceof Request ? input.url : String(input), "http://localhost:4999");
        const call = { method: init?.method ?? (input instanceof Request ? input.method : "GET"), url, init };
        calls.push(call);
        return handler ? await handler(call) : defaultRepositoryResponse(call);
    }) as typeof fetch;
    return calls;
}

export function resetRepositoryDom(): void {
    globalThis.fetch = realFetch;
    document.head.innerHTML = "";
    document.body.replaceChildren();
    history.replaceState(null, "", "/");
}

export async function mountRepositoryConsole(): Promise<HTMLElement> {
    document.head.innerHTML = '<meta name="basePath" content="/cms">';
    const console = document.createElement("cms-repository-admin");
    document.body.append(console);
    await waitFor(() => console.textContent?.includes("Repository health: healthy") === true);
    return console;
}

export async function loadCommerce(console: HTMLElement): Promise<void> {
    const form = required<HTMLFormElement>(console, "[data-versions-form]");
    required<HTMLInputElement>(form, '[name="kind"]').value = "commerce";
    submit(form);
    await waitFor(() => console.textContent?.includes("Loaded 2 version(s) for commerce") === true);
}

export async function selectCurrentVersion(console: HTMLElement): Promise<void> {
    await loadCommerce(console);
    required<HTMLButtonElement>(console, '[data-version="1.1.0"]').click();
    await waitFor(() => console.textContent?.includes("Current report: compatible") === true);
}

export function submit(form: HTMLFormElement): void {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

export function required<T extends Element>(root: ParentNode, selector: string): T {
    const node = root.querySelector<T>(selector);
    if (!node) {
        throw new Error(`Missing test element ${selector}`);
    }
    return node;
}

export async function waitFor(predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!predicate()) {
        if (Date.now() >= deadline) {
            throw new Error("Timed out waiting for repository console state");
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
}
