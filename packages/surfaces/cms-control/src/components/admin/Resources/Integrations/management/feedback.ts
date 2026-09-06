const changed = "cms-integration-management:feedback";
const latest = new WeakMap<HTMLElement, { installationId: string; message: string }>();

/** Keeps action feedback on the workspace while its bound detail view is replaced. */
export function managementFeedback(host: HTMLElement, installationId: string, render: (message: string) => void) {
    const workspace = host.closest<HTMLElement>("cms-integrations-admin") ?? host.parentElement ?? host;
    const refresh = () => {
        const state = latest.get(workspace);
        render(state?.installationId === installationId ? state.message : "");
    };
    workspace.addEventListener(changed, refresh);
    return {
        refresh,
        set(message: string): void {
            latest.set(workspace, { installationId, message });
            workspace.dispatchEvent(new Event(changed));
        },
        disconnect(): void {
            workspace.removeEventListener(changed, refresh);
        },
    };
}
