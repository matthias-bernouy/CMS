import { describe, expect, test } from "bun:test";
import { eventLabel, lastRun, runtimeState } from "cms-control/components/admin/Resources/Triggers/presentation";
import type { TriggerListItem } from "cms-control/components/admin/Resources/Triggers/api";
import "cms-control/components/admin/Resources/Triggers/TriggersAdmin";

describe("scheduled trigger presentation", () => {
    test("shows paused, next-run, and latest execution details", () => {
        const scheduled = trigger();

        expect(eventLabel(scheduled)).toBe("Every 30 s");
        expect(runtimeState({ ...scheduled, schedulerAvailable: false }).textContent).toContain("Scheduler paused");
        expect(runtimeState(scheduled).textContent).toContain("Scheduled");
        expect(runtimeState(scheduled).textContent).toContain("Next");
        expect(lastRun(scheduled).textContent).toContain("ok");
        expect(lastRun(scheduled).textContent).toContain("250 ms");
    });

    test("guards disabling a critical scheduled trigger", async () => {
        const originalFetch = globalThis.fetch;
        const originalConfirm = window.confirm;
        const methods: string[] = [];
        globalThis.fetch = (async (_input, init) => {
            methods.push(init?.method ?? "GET");
            return Response.json([{ ...trigger(), critical: true }]);
        }) as typeof fetch;
        window.confirm = () => false;
        try {
            const element = document.createElement("cms-triggers-admin");
            document.body.append(element);
            await new Promise((resolve) => setTimeout(resolve, 0));
            const checkbox = element.querySelector<HTMLInputElement>('input[type="checkbox"]');
            if (!checkbox) {
                throw new Error("trigger checkbox not rendered");
            }

            checkbox.click();

            expect(checkbox.checked).toBe(true);
            expect(methods).toEqual(["GET"]);
            element.remove();
        } finally {
            globalThis.fetch = originalFetch;
            window.confirm = originalConfirm;
        }
    });
});

function trigger(): TriggerListItem {
    return {
        id: "scheduled-notifications",
        label: "Dispatch notifications",
        enabled: true,
        schedulerAvailable: true,
        integration: { id: "commerce", label: "Commerce" },
        event: { kind: "schedule", intervalMs: 30_000 },
        task: { id: "cms.notifications.dispatch" },
        scheduleState: { nextRunAt: "2026-07-23T10:00:30.000Z" },
        lastRun: {
            at: "2026-07-23T10:00:00.000Z",
            status: "ok",
            durationMs: 250,
        },
    };
}
