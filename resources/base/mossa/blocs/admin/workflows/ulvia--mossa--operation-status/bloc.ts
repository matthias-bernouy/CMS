import { initialOperation, operationLink, validOperationId } from "./runtime/location";
import { watchOperation } from "./runtime/poll";
import { renderOperation } from "./runtime/render";
import { operationAction } from "./runtime/submit";

export function mount(root: HTMLElement): () => void {
    const panel = root.querySelector<HTMLElement>(':scope > [part~="operation-panel"]');
    const action = root.querySelector<HTMLElement>(':scope > [part~="operation-action"]');
    const part = <T extends HTMLElement>(name: string): T | null =>
        panel?.querySelector<T>(`[part~="operation-${name}"]`) ?? null;
    const copy = (key: string): string =>
        panel?.querySelector(`[data-operation-copy="${key}"]`)?.textContent?.trim() ?? "";
    const status = part<HTMLOutputElement>("status");
    const hint = part<HTMLElement>("hint");
    const refresh = part<HTMLButtonElement>("refresh");
    let stopWatch: (() => void) | null = null;
    const cancel = (): void => {
        stopWatch?.();
        stopWatch = null;
    };
    const busy = (value: boolean): void => {
        if (value) {
            root.setAttribute("aria-busy", "true");
        } else {
            root.removeAttribute("aria-busy");
        }
        if (refresh) {
            refresh.disabled = value;
        }
    };
    const showStatus = (key: string): void => {
        const next = copy(key);
        if (status && status.textContent !== next) {
            status.textContent = next;
        }
    };
    const start = (): void => {
        cancel();
        busy(false);
        root.setAttribute("data-operation-state", "idle");
        for (const name of ["updated", "phase", "server-error"]) {
            const element = part<HTMLElement>(name);
            if (element) {
                element.textContent = "";
            }
        }
        const id = root.getAttribute("operation-id")?.trim() ?? "";
        const valid = validOperationId(id);
        const actions = part<HTMLElement>("actions");
        const technical = part<HTMLElement>("technical");
        if (actions) {
            actions.hidden = !valid;
        }
        if (technical) {
            technical.hidden = !valid;
        }
        const hasAction = !!action?.children.length;
        if (action) {
            action.hidden = !hasAction || valid;
        }
        if (panel) {
            panel.hidden = !valid && hasAction;
        }
        showStatus(valid ? "loading" : "empty");
        if (hint) {
            hint.textContent = valid ? copy("pending") : "";
        }
        const identity = part<HTMLElement>("identity");
        if (identity) {
            identity.textContent = valid ? id : "";
        }
        const target = valid ? operationLink(root, id) : null;
        const link = part<HTMLAnchorElement>("permalink");
        const wrapper = part<HTMLElement>("link");
        if (wrapper) {
            wrapper.hidden = !target;
        }
        if (link) {
            link.removeAttribute("href");
            if (target) {
                link.href = target.href;
            }
        }
        if (valid) {
            stopWatch = watchOperation(id, {
                busy,
                render: (value) => renderOperation(root, value, copy),
                unavailable: (retrying) => {
                    root.setAttribute("data-operation-state", "unavailable");
                    showStatus("unavailable");
                    if (hint) {
                        hint.textContent = copy(retrying ? "reconnecting" : "retry");
                    }
                },
                limit: () => {
                    if (hint) {
                        hint.textContent = copy("manual");
                    }
                },
            });
        }
    };
    const stopAction = operationAction(root, {
        loading: () => {
            if (action) {
                action.hidden = true;
            }
            if (panel) {
                panel.hidden = false;
            }
            showStatus("loading");
            if (hint) {
                hint.textContent = "";
            }
            status?.focus();
        },
        failed: () => {
            if (action) {
                action.hidden = !action.children.length;
            }
            root.setAttribute("data-operation-state", "unavailable");
            showStatus("start-failed");
            if (hint) {
                hint.textContent = copy("start-retry");
            }
        },
        accepted: (id) => {
            const target = operationLink(root, id);
            if (target) {
                window.history.replaceState(window.history.state, "", target);
            }
            root.setAttribute("operation-id", id);
            status?.focus();
        },
    });
    if (!root.getAttribute("operation-id")) {
        const id = initialOperation(root);
        if (id) {
            root.setAttribute("operation-id", id);
        }
    }
    const observer = new MutationObserver(start);
    observer.observe(root, { attributes: true, attributeFilter: ["operation-id", "result-param", "tracking-only"] });
    refresh?.addEventListener("click", start);
    start();
    return () => {
        stopAction();
        cancel();
        observer.disconnect();
        refresh?.removeEventListener("click", start);
    };
}
