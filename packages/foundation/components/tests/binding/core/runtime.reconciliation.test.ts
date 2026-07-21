import { afterEach, describe, expect, test } from "bun:test";
import { currentState, PARAMS_CHANGE_EVENT, setState } from "../../../src/binding/params";
import { BindingRuntime } from "../../../src/binding/runtime/BindingRuntime";
import { el, res, resetDom, waitFor } from "../testUtils";

afterEach(resetDom);

describe("BindingRuntime — source render reconciliation", () => {
    test("disposes detached parameter and page-state controls without observer delivery", async () => {
        const stateKey = "detached-control-state";
        setState(stateKey, "", document);
        let outerCalls = 0;
        globalThis.fetch = (async () => res(200, JSON.stringify({ items: [++outerCalls] }))) as unknown as typeof fetch;
        const root = el(`
            <div>
                <div cms-source="/outer" cms-reload-on="refresh">
                    <section cms-repeat="items as item">
                        <input class="param" cms-param-sync="detached-control-param" value="{{ item }}">
                        <input class="state" cms-page-state="${stateKey}" value="{{ item }}">
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
        document.addEventListener(PARAMS_CHANGE_EVENT, onParamChange);

        try {
            runtime.start();
            await waitFor(() => outerCalls === 1 && root.querySelector(".param") !== null);
            const detachedParam = root.querySelector<HTMLInputElement>(".param")!;
            const detachedState = root.querySelector<HTMLInputElement>(".state")!;

            // Exercise the synchronous Source-render path independently from mutation delivery.
            (runtime as unknown as { observer: MutationObserver | null }).observer?.disconnect();
            document.dispatchEvent(new Event("refresh"));
            await waitFor(() => outerCalls === 2 && root.querySelector(".param") !== detachedParam);

            detachedParam.value = "stale";
            detachedParam.dispatchEvent(new Event("change"));
            detachedState.value = "stale";
            detachedState.dispatchEvent(new Event("change"));
            expect(paramChanges).toBe(0);
            expect(currentState(stateKey, document)).toBe("");

            const activeParam = root.querySelector<HTMLInputElement>(".param")!;
            const activeState = root.querySelector<HTMLInputElement>(".state")!;
            activeParam.value = "active";
            activeParam.dispatchEvent(new Event("change"));
            activeState.value = "active";
            activeState.dispatchEvent(new Event("change"));
            expect(paramChanges).toBe(1);
            expect(currentState(stateKey, document)).toBe("active");
        } finally {
            document.removeEventListener(PARAMS_CHANGE_EVENT, onParamChange);
            runtime.stop();
            setState(stateKey, "", document);
        }
    });
});
