import { afterEach, describe, expect, test } from "bun:test";
import { adminSystemSettingsStore } from "cms-control/components/admin/Common/SystemSettings/store";

const originalFetch = globalThis.fetch;

afterEach(() => {
    adminSystemSettingsStore.invalidate();
    globalThis.fetch = originalFetch;
});

describe("admin system settings store", () => {
    test("does not publish a response invalidated before it arrives", async () => {
        const responses: Array<(response: Response) => void> = [];
        globalThis.fetch = (() =>
            new Promise<Response>((resolve) => {
                responses.push(resolve);
            })) as unknown as typeof fetch;

        const obsolete = adminSystemSettingsStore.load();
        adminSystemSettingsStore.invalidate();
        const current = adminSystemSettingsStore.load();
        expect(responses).toHaveLength(2);

        responses[1]!(settingsResponse("Current"));
        expect((await current).site.name).toBe("Current");
        responses[0]!(settingsResponse("Obsolete"));
        expect((await obsolete).site.name).toBe("Current");
        expect((await adminSystemSettingsStore.load()).site.name).toBe("Current");
        expect(responses).toHaveLength(2);
    });

    test("does not publish a response invalidated while its body is parsed", async () => {
        let releaseBody: ((settings: unknown) => void) | undefined;
        let markBodyStarted: (() => void) | undefined;
        const bodyStarted = new Promise<void>((resolve) => {
            markBodyStarted = resolve;
        });
        let calls = 0;
        globalThis.fetch = (async () => {
            calls += 1;
            if (calls > 1) {
                return settingsResponse("Current");
            }
            return {
                ok: true,
                json: () => {
                    markBodyStarted?.();
                    return new Promise((resolve) => {
                        releaseBody = resolve;
                    });
                },
            } as Response;
        }) as unknown as typeof fetch;

        const obsolete = adminSystemSettingsStore.load();
        await bodyStarted;
        adminSystemSettingsStore.invalidate();
        expect((await adminSystemSettingsStore.load()).site.name).toBe("Current");
        releaseBody?.(await settingsResponse("Obsolete").json());
        expect((await obsolete).site.name).toBe("Current");
        expect(calls).toBe(2);
    });

    test("does not cache an incomplete settings response", async () => {
        let calls = 0;
        globalThis.fetch = (async () => {
            calls += 1;
            return calls === 1 ? Response.json({ site: { name: "Incomplete" } }) : settingsResponse("Current");
        }) as unknown as typeof fetch;

        await expect(adminSystemSettingsStore.load()).rejects.toThrow("System settings are unavailable.");
        expect((await adminSystemSettingsStore.load()).site.name).toBe("Current");
        expect(calls).toBe(2);
    });
});

function settingsResponse(siteName: string): Response {
    return Response.json({
        site: { name: siteName },
        theme: {
            activeThemeId: "default",
            sources: [],
            themes: [{ id: "default", name: "Default", values: { light: {}, dark: {} } }],
        },
    });
}
