import { afterEach, expect, test } from "bun:test";
import { BindingRuntime } from "../../../../src/browser/binding/runtime/BindingRuntime";
import { el, resetDom, settle, waitFor } from "../../support/testUtils";

afterEach(resetDom);

for (const setting of [undefined, "true", "false"]) {
    test(`submission query inheritance ${setting ?? "default"} preserves explicit parameters`, async () => {
        location.href = "http://localhost/admin/sources?id=page&row=r1";
        let submitted: URL | undefined;
        globalThis.fetch = (async (input: string | URL | Request) => {
            submitted = new URL(String(input));
            return Response.json({ ok: true });
        }) as unknown as typeof fetch;
        const form = el(
            `<form cms-source="/api/action?id=target as result" cms-source-method="POST" cms-source-trigger="submit"><input name="actionId" value="repair"></form>`,
        ) as HTMLFormElement;
        if (setting !== undefined) {
            form.setAttribute("cms-source-inherit-query", setting);
        }
        document.body.append(form);
        const runtime = new BindingRuntime(form);
        runtime.start();
        await settle();
        form.requestSubmit();
        await waitFor(() => Boolean(submitted));
        expect(submitted!.searchParams.getAll("id")).toEqual(setting === "false" ? ["target"] : ["target", "page"]);
        expect(submitted!.searchParams.get("row")).toBe(setting === "false" ? null : "r1");
        runtime.stop();
    });
}
