import { describe, expect, test } from "bun:test";

async function source(file = "servers.ts"): Promise<string> {
    return Bun.file(new URL(`../src/commands/dev/${file}`, import.meta.url)).text();
}

describe("local CMS listener composition", () => {
    test("waits for Control readiness before listening", async () => {
        const text = await source();
        const ready = text.indexOf("await cms.ready");
        const listen = text.indexOf("runner.start", ready);

        expect(ready).toBeGreaterThan(-1);
        expect(listen).toBeGreaterThan(ready);
    });

    test("shares an in-memory analytics store between Control and Delivery", async () => {
        const text = await source();

        expect(text).toContain("new ValidatingAnalyticsStore(new InMemoryAnalyticsStore())");
        expect(text).toContain("createLocalEndpointPerformance(");
        expect(text).toContain("endpointPerformanceReports: endpointPerformance.reports");
        expect(text).toContain("sourceTelemetry: endpointPerformance.controlTelemetry");
        expect(text).toMatch(/services\.sources,\s*analytics,\s*services\.roles/);
        expect(text).toMatch(
            /new DeliveryCms\(\{[\s\S]*sources: services\.sources,[\s\S]*sourceOverlays: services\.sourceOverlays,[\s\S]*sourceTelemetry: endpointPerformance\.deliveryTelemetry,[\s\S]*analytics,\s*analyticsVisitorSecret,/,
        );
    });

    test("shares the production Source image pipeline with Control and Delivery", async () => {
        const text = await source();

        expect(text).toContain("createLocalSourceImageComposition");
        expect(text.match(/sourceImageInterceptor: sourceImages\.sourceImageInterceptor/g)).toHaveLength(2);
        expect(text.match(/responsivePublicSourceImagesEnabled: sourceImages\./g)).toHaveLength(2);
        expect(text.match(/responsivePrivateSourceImagesEnabled: sourceImages\./g)).toHaveLength(2);
        expect(text).toContain("await sourceImages.dispose()");
    });

    test("flushes endpoint performance before local shutdown", async () => {
        const text = await source();

        expect(text).toContain("endpointPerformance.stopFlusher()");
        expect(text).toContain("runner.stopGracefully()");
        expect(text).toContain("deliveryRunner.stopGracefully()");
        expect(text).toContain("await endpointPerformance.flush()");
        expect(text).toContain("stopping ??=");
    });

    test("mounts repository reads only on Delivery and points loopback consumption at Delivery", async () => {
        const servers = await source();
        const services = await source("services.ts");
        const controlSection = servers.slice(servers.indexOf("const runner"), servers.indexOf("const deliveryRunner"));
        const deliverySection = servers.slice(servers.indexOf("const deliveryRunner"));

        expect(controlSection).not.toContain('group("/.cms/repository"');
        expect(deliverySection).toContain('deliveryRunner.group("/.cms/repository"');
        expect(services).toContain("options.deliveryPort}/.cms/repository");
        expect(services).not.toContain("options.port}/.cms/repository");
    });

    test("coalesces repeated process shutdown signals", async () => {
        const text = await source("index.ts");

        expect(text).toContain("let stopping = false");
        expect(text).toMatch(/if \(stopping\) \{\s*return;\s*\}/);
        expect(text).toContain("stopping = true");
    });

    test.failing("binds both local listeners to the parsed host", async () => {
        const text = await source();

        expect(text).toMatch(/runner\.start\(\{\s*port,\s*hostname:\s*host\s*\}\)/);
        expect(text).toMatch(/deliveryRunner\.start\(\{\s*port:\s*deliveryPort,\s*hostname:\s*host\s*\}\)/);
    });
});
