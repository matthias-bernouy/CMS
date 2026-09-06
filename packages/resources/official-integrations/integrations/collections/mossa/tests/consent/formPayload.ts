import { BINDING_CORE_TAG } from "@bernouy/components/binding";

export async function submitConsentValues(values: FormData): Promise<Record<string, unknown>> {
    let body: Record<string, unknown> | undefined;
    globalThis.fetch = (async (_input, init) => {
        body = JSON.parse(String(init?.body));
        return Response.json({ ok: true });
    }) as typeof fetch;
    const core = document.createElement(BINDING_CORE_TAG);
    const form = document.createElement("form");
    form.setAttribute("cms-source", "/api/signup as signup");
    form.setAttribute("cms-source-trigger", "submit");
    form.setAttribute("cms-source-method", "POST");
    // Happy DOM does not add ElementInternals FormData to its native form collection.
    // Project the captured field entries into native controls, then exercise Binding Core.
    for (const [name, value] of values) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = String(value);
        form.append(input);
    }
    core.append(form);
    document.body.append(core);
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    for (let attempt = 0; attempt < 80 && !body; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    core.remove();
    if (!body) {
        throw new Error("The consent form was not submitted through Binding Core");
    }
    return body;
}
