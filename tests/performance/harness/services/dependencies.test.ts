import { expect, test } from "bun:test";
import { collectMetrics } from "../docker/metrics";

test("required DNS evidence cannot be omitted or fabricated and contributes measured request/byte work", () => {
    const target = `ulvia/cms.hosting@1.1.0#sha256:${"a".repeat(64)}:zones.verify`;
    const read = (dependencies?: Parameters<typeof collectMetrics>[7]) =>
        collectMetrics("trace", [], [], true, target, [], false, dependencies);
    expect(read().work.instrumentationComplete).toBe(false);
    const dns = { service: "dns" as const, requests: 1, requestBytes: 55, responseBytes: 120, complete: true };
    const measured = read([dns]);
    expect(measured.work.instrumentationComplete).toBe(true);
    expect(measured.work.internalRequests).toBe(1);
    expect(measured.work.internalResponseBytes).toBe(120);
    expect(measured.breakdown?.businessInternalRequests).toBe(1);
    expect(measured.breakdown?.commonInternalRequests).toBe(0);
    expect(measured.network).toEqual([{ path: "controlled-dns", requests: 1, responseBytes: 120 }]);
    expect(read([{ ...dns, requests: 0 }]).work.instrumentationComplete).toBe(false);
    expect(read([{ ...dns, responseBytes: Number.NaN }]).work.instrumentationComplete).toBe(false);
    expect(read([dns, dns]).work.instrumentationComplete).toBe(false);
    expect(collectMetrics("trace", [], [], true, "other").work.instrumentationComplete).toBe(true);
    const tls = `ulvia/provider.tls@1.0.0#sha256:${"b".repeat(64)}:certificates.permit`;
    expect(collectMetrics("trace", [], [], true, tls).work.instrumentationComplete).toBe(false);
    expect(collectMetrics("trace", [], [], true, tls, [], false, [dns]).work.instrumentationComplete).toBe(true);
});
