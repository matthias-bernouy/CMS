import { afterEach, describe, expect, test } from "bun:test";
import { BindingRuntime } from "../../../src/browser/binding/runtime/BindingRuntime";
import { readSyncValue, subscribeSyncValue, writeSyncValue } from "../../../src/browser/binding/state/SyncState";
import { el, res, resetDom, waitFor } from "../support/testUtils";

afterEach(resetDom);

describe("BindingRuntime — query render reconciliation", () => {
    test("disposes detached synchronized controls without observer delivery", async () => {
        const paramTarget = { scope: "param", key: "test-detached-param" } as const;
        const pageTarget = { scope: "page", key: "test-detached-state" } as const;
        const refreshTarget = { scope: "page", key: "test-query-refresh" } as const;
        writeSyncValue(paramTarget, undefined);
        writeSyncValue(pageTarget, undefined);
        writeSyncValue(refreshTarget, undefined);
        let outerCalls = 0;
        globalThis.fetch = (async () => res(200, JSON.stringify({ items: [++outerCalls] }))) as unknown as typeof fetch;
        const root = el(`
            <div>
                <div cms-query="ulvia.cms.access:resolve-actor as outer" cms-query-listen="@page:test-query-refresh">
                    <section cms-repeat="outer.data.items as item">
                        <input class="param" cms-sync="@param:test-detached-param" value="{{ item }}">
                        <input class="state" cms-sync="@page:test-detached-state" value="{{ item }}">
                    </section>
                </div>
            </div>
        `);
        document.body.appendChild(root);
        const runtime = new BindingRuntime(root);
        let paramChanges = 0;
        const onParamChange = () => {
            paramChanges++;
        };
        const stopParam = subscribeSyncValue(paramTarget, onParamChange);

        try {
            runtime.start();
            await waitFor(() => outerCalls === 1 && root.querySelector(".param") !== null);
            const detachedParam = root.querySelector<HTMLInputElement>(".param")!;
            const detachedState = root.querySelector<HTMLInputElement>(".state")!;

            // Exercise the synchronous Query-render path independently from mutation delivery.
            (runtime as unknown as { observer: MutationObserver | null }).observer?.disconnect();
            writeSyncValue(refreshTarget, outerCalls);
            await waitFor(() => outerCalls === 2 && root.querySelector(".param") !== detachedParam);

            detachedParam.value = "stale";
            detachedParam.dispatchEvent(new Event("change"));
            detachedState.value = "stale";
            detachedState.dispatchEvent(new Event("change"));
            expect(paramChanges).toBe(0);
            expect(readSyncValue(pageTarget)).toBeUndefined();

            const activeParam = root.querySelector<HTMLInputElement>(".param")!;
            const activeState = root.querySelector<HTMLInputElement>(".state")!;
            activeParam.value = "active";
            activeParam.dispatchEvent(new Event("change"));
            activeState.value = "active";
            activeState.dispatchEvent(new Event("change"));
            expect(paramChanges).toBe(1);
            expect(readSyncValue(pageTarget)).toBe("active");
        } finally {
            stopParam();
            runtime.stop();
            writeSyncValue(paramTarget, undefined);
            writeSyncValue(pageTarget, undefined);
            writeSyncValue(refreshTarget, undefined);
        }
    });
});
