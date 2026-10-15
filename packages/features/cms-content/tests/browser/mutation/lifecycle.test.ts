import { afterEach, describe, expect, test } from "bun:test";
import { BindingRuntime } from "../../../src/browser/binding/runtime/BindingRuntime";
import { readSyncValue, writeSyncValue } from "../../../src/browser/binding/state/SyncState";
import { el, resetDom, waitFor } from "../support/testUtils";

afterEach(resetDom);

describe("Form mutation lifecycle", () => {
    test("publishes typed input, activity and outcome through cms-sync", async () => {
        const target = { scope: "page", key: "ulvia-official-profile-form" } as const;
        globalThis.fetch = (async () => Response.json({ id: "profile-1" }, { status: 201 })) as typeof fetch;
        const root = el(`
            <form cms-mutation="profiles:update as profile" cms-sync="@page:ulvia-official-profile-form">
                <input name="displayName" value="Ada">
            </form>
        `) as HTMLFormElement;
        document.body.append(root);
        const runtime = new BindingRuntime(root);
        runtime.start();
        const input = root.querySelector<HTMLInputElement>("input")!;

        input.value = "Grace";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        expect(readSyncValue(target)).toMatchObject({
            dirty: true,
            activity: "idle",
            input: { displayName: "Grace" },
            outcome: { kind: "none" },
        });

        root.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await waitFor(
            () => (readSyncValue(target) as { outcome?: { kind?: string } } | undefined)?.outcome?.kind === "success",
        );
        expect(readSyncValue(target)).toMatchObject({
            dirty: false,
            activity: "idle",
            hasData: true,
            input: { displayName: "Grace" },
            data: { id: "profile-1" },
            outcome: { kind: "success", status: 201 },
            lastSuccess: {
                status: 201,
                data: { id: "profile-1" },
                requestId: expect.any(String),
            },
        });
        runtime.stop();
        writeSyncValue(target, undefined);
    });
});
