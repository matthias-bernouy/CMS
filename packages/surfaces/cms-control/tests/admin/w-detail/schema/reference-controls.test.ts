import { afterEach, expect, test } from "bun:test";
import { detailField } from "../../../../src/components/admin/Resources/Dashboards/runtime/mapping/fields";
import {
    createFieldControl,
    readFieldControlValue,
} from "../../../../src/components/admin/Resources/Dashboards/widgets/w-detail/controls";
import {
    createItemControl,
    readItemControl,
} from "../../../../src/components/admin/Resources/Dashboards/widgets/w-reorderable-list/controls";

const originalFetch = globalThis.fetch;
afterEach(() => {
    globalThis.fetch = originalFetch;
    document.body.replaceChildren();
});

test("reference controls reuse credentials and published-only page selection without external or media tabs", async () => {
    const requests: string[] = [];
    globalThis.fetch = (async (url: string | URL | Request) => {
        requests.push(String(url));
        return Response.json([{ path: "/terms", title: "Terms" }]);
    }) as typeof fetch;
    const field = detailField(
        { id: "page", label: "Legal page", path: "page", type: "page-link", publishedOnly: true },
        { page: "/terms" },
        {},
        {},
        "source",
    );
    const page = createFieldControl(field);
    document.body.append(page);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(requests).toEqual(["/api/page/links?visible=published"]);
    expect(page.getAttribute("allow-external")).toBe("false");
    expect(page.getAttribute("allow-media")).toBe("false");
    expect(readFieldControlValue(field, page)).toBe("/terms");
    const secret = createItemControl({ signing: { key: "${SIGNING_KEY}" } }, 0, {
        id: "key",
        label: "Signing key",
        path: "signing.key",
        type: "secret-ref",
    });
    document.body.append(secret);
    expect(secret.tagName.toLowerCase()).toBe("cms-credential-select");
    expect(readItemControl(secret)).toBe("${SIGNING_KEY}");
    expect(secret.shadowRoot?.textContent).not.toContain("a-secret-value");
});
