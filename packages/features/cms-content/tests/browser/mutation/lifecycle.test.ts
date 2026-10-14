import { afterEach, describe, expect, test } from "bun:test";
import { BindingRuntime } from "../../../src/browser/binding/runtime/BindingRuntime";
import { readSyncValue, writeSyncValue } from "../../../src/browser/binding/state/SyncState";
import { el, resetDom, settle, waitFor } from "../support/testUtils";

afterEach(resetDom);

describe("Form mutation — submit trigger lifecycle", () => {
    test("publishes form input, dirty state and result through cms-sync", async () => {
        const target = { scope: "page", key: "ulvia-official-profile-form" } as const;
        globalThis.fetch = (async () =>
            new Response(JSON.stringify({ id: "profile-1" }), {
                status: 201,
                headers: { "content-type": "application/json" },
            })) as typeof fetch;
        const root = el(`
            <form cms-source="/api/profile as result" cms-source-trigger="submit" cms-source-method="POST"
                cms-sync="@page:ulvia-official-profile-form">
                <input name="displayName" value="Ada">
            </form>
        `) as HTMLFormElement;
        document.body.append(root);
        const runtime = new BindingRuntime(root);
        runtime.start();
        const input = root.querySelector<HTMLInputElement>("input")!;

        input.value = "Grace";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        expect(readSyncValue(target)).toMatchObject({ dirty: true, input: { displayName: "Grace" } });

        root.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await waitFor(() => (readSyncValue(target) as { loaded?: boolean } | undefined)?.loaded === true);
        expect(readSyncValue(target)).toMatchObject({
            dirty: false,
            input: { displayName: "Grace" },
            data: { ok: true, status: 201, body: { id: "profile-1" } },
        });
        runtime.stop();
        writeSyncValue(target, undefined);
    });

    test("change-triggered form sources submit after a control change, not on startup", async () => {
        const requests: RequestInit[] = [];
        globalThis.fetch = (async (_url: string, init?: RequestInit) => {
            requests.push(init ?? {});
            return new Response(JSON.stringify({ ok: true }), {
                headers: { "content-type": "application/json" },
            });
        }) as typeof fetch;

        const root = el(`
            <form cms-source="/api/preferences as result" cms-source-trigger="change" cms-source-method="POST" cms-source-success-reset="false">
                <select name="level"><option value="club" selected>Club</option></select>
                <input name="style" value="defender">
            </form>
        `) as HTMLFormElement;
        document.body.append(root);
        const runtime = new BindingRuntime(root);
        runtime.start();
        await settle();
        expect(requests).toHaveLength(0);

        root.querySelector("select")!.dispatchEvent(new Event("change", { bubbles: true }));
        await waitFor(() => requests.length === 1);

        expect(requests[0]?.method).toBe("POST");
        expect(requests[0]?.body).toBe(JSON.stringify({ level: "club", style: "defender" }));
        runtime.stop();
    });

    test("change-triggered forms debounce edits and submit the latest queued values", async () => {
        const bodies: string[] = [];
        let releaseFirst: (() => void) | undefined;
        globalThis.fetch = (async (_url: string, init?: RequestInit) => {
            bodies.push(String(init?.body));
            if (bodies.length === 1) {
                await new Promise<void>((resolve) => {
                    releaseFirst = resolve;
                });
            }
            return new Response(JSON.stringify({ ok: true }), {
                headers: { "content-type": "application/json" },
            });
        }) as typeof fetch;

        const root = el(`
            <form cms-source="/api/preferences as result" cms-source-trigger="change" cms-source-delay="20" cms-source-method="POST" cms-source-success-reset="false">
                <input name="club" value="initial">
            </form>
        `) as HTMLFormElement;
        document.body.append(root);
        const runtime = new BindingRuntime(root);
        runtime.start();
        const input = root.querySelector<HTMLInputElement>("input")!;

        input.value = "first";
        input.dispatchEvent(new Event("change", { bubbles: true }));
        await waitFor(() => bodies.length === 1);
        input.value = "second";
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.value = "latest";
        input.dispatchEvent(new Event("change", { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 30));
        releaseFirst?.();
        await waitFor(() => bodies.length === 2);

        expect(JSON.parse(bodies[0]!)).toEqual({ club: "first" });
        expect(JSON.parse(bodies[1]!)).toEqual({ club: "latest" });
        runtime.stop();
    });
});
