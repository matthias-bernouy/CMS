import { expect, test } from "bun:test";
import { kernelSystemMayInvoke } from "../../src/runtime/gateway/kernelSystemAccess";

test("adding observability preserves the Kernel Content machine consumers without granting journal reads", () => {
    const actor = { kind: "system", serviceId: "cms-kernel" } as const;
    for (const capability of ["delivery.read", "delivery.robots", "delivery.sitemap", "delivery.collection-asset"]) {
        expect(kernelSystemMayInvoke(actor, "ulvia.cms.content", capability)).toBe(true);
    }
    expect(kernelSystemMayInvoke(actor, "ulvia.cms.observability", "logs.append")).toBe(true);
    for (const capability of ["logs.query", "logs.get", "logs.aggregate"]) {
        expect(kernelSystemMayInvoke(actor, "ulvia.cms.observability", capability)).toBe(false);
    }
    expect(kernelSystemMayInvoke(actor, "ulvia.cms.content", "pages.delete")).toBe(false);
    expect(
        kernelSystemMayInvoke({ kind: "system", serviceId: "unknown" }, "ulvia.cms.observability", "logs.append"),
    ).toBe(false);
    expect(
        kernelSystemMayInvoke({ kind: "administrator", subjectId: "admin" }, "ulvia.cms.observability", "logs.query"),
    ).toBe(true);
});
