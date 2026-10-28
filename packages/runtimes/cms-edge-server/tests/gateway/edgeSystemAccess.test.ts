import { expect, test } from "bun:test";
import { edgeSystemMayInvoke } from "../../src/runtime/gateway/edgeSystemAccess";

test("Edge system authority is limited to diagnostic ingestion", () => {
    const actor = { kind: "system", serviceId: "cms-edge" } as const;
    for (const capability of ["delivery.resolve-path", "pages.list", "pages.get"]) {
        expect(edgeSystemMayInvoke(actor, "ulvia.cms.content", capability)).toBe(false);
    }
    expect(edgeSystemMayInvoke(actor, "ulvia.cms.observability", "logs.append")).toBe(true);
    for (const capability of ["logs.query", "logs.get", "logs.aggregate"]) {
        expect(edgeSystemMayInvoke(actor, "ulvia.cms.observability", capability)).toBe(false);
    }
    expect(edgeSystemMayInvoke(actor, "ulvia.cms.content", "pages.delete")).toBe(false);
    expect(
        edgeSystemMayInvoke({ kind: "system", serviceId: "unknown" }, "ulvia.cms.observability", "logs.append"),
    ).toBe(false);
    expect(
        edgeSystemMayInvoke({ kind: "administrator", subjectId: "admin" }, "ulvia.cms.observability", "logs.query"),
    ).toBe(true);
});
