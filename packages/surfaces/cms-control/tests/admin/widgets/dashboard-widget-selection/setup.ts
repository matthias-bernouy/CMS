import { afterEach } from "bun:test";
import "cms-control/components";

const realFetch = globalThis.fetch;

export function setupDashboardWidgetSelectionTests(): void {
    afterEach(() => {
        globalThis.fetch = realFetch;
        document.body.replaceChildren();
    });
}
