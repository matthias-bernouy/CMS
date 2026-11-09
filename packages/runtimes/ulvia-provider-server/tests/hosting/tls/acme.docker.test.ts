import { expect, test } from "bun:test";
import { certificateSerial, proxyReady } from "./probes";
import { BunRunner } from "@bernouy/http-runner";
import { NOOP_LOGGER } from "@bernouy/logging";
import { DomainRegistry } from "@bernouy/hosting";
import { InMemoryHostingStore } from "@bernouy/hosting/memory";
import { DomainTlsAuthority, DomainTlsReconciler } from "@bernouy/hosting/tls";
import { mountPublicCapabilities } from "@bernouy/ulvia-provider";
import { domainConfigurationProbe } from "../../../src/runtime/instances/system/hosting/tls/dns";
import { probeCertificate } from "../../../src/runtime/instances/system/hosting/tls/certificate";
import { createTlsRuntime } from "../../../src/runtime/instances/system/hosting/tlsRuntime";
import { SystemBootstrap } from "../../../src/runtime/instances/system/execution/SystemBootstrap";
import { bundledBootstrapSources } from "../../../src/runtime/instances/system/bootstrap";

const integration = process.env.ULVIA_TEST_CADDY_ACME === "1" ? test : test.skip;
integration(
    "Caddy obtains real Pebble certificates through the admitted permission binding and restores them on both entrypoints",
    async () => {
        const ca = await Bun.file("/trust/pebble.minica.pem").text();
        const roots = await fetch("https://pebble:15000/roots/0", { tls: { ca }, signal: AbortSignal.timeout(5000) });
        expect(roots.status).toBe(200);
        const trust = await roots.text();
        const nodes = [
            { host: "proxy-a", port: 443 },
            { host: "proxy-b", port: 443 },
        ];
        const addresses = JSON.parse(process.env.ULVIA_TEST_TLS_ADDRESSES!) as string[];
        const store = new InMemoryHostingStore();
        const instances = {
            getInstance: async (id: string) => ({
                id,
                revision: 1,
                status: "ready" as const,
                cmsUrl: "https://control.ulvia.test",
            }),
        };
        const registry = new DomainRegistry(
            store,
            instances,
            {
                assertAdministrator: async () => undefined,
                assertDomainCanBeDisabled: async () => undefined,
            },
            "isolated-acme-proof-secret".repeat(2),
            async () => false,
        );
        const control = await registry.registerManaged("instance:control", "https://control.ulvia.test");
        await registry.claim(
            { instanceId: "instance:control", subjectId: "admin" },
            "instance:control",
            "https://pending.ulvia.test",
        );
        const authority = new DomainTlsAuthority(
            store,
            instances,
            domainConfigurationProbe({
                localDevelopment: false,
                addresses,
                entrypoints: nodes,
            }),
        );
        const runtime = await createTlsRuntime(new SystemBootstrap(bundledBootstrapSources()), authority);
        const runner = new BunRunner();
        mountPublicCapabilities(runner, runtime, NOOP_LOGGER);
        runner.start({ hostname: "0.0.0.0", port: 5103 });
        // This fixture exercises TLS and host forwarding, not CMS rendering or native setup.
        const upstream = Bun.serve({
            hostname: "0.0.0.0",
            port: 5104,
            fetch: (request) =>
                new URL(request.url).pathname === "/readyz"
                    ? new Response(null, { status: 204 })
                    : Response.json({ host: request.headers.get("host") }),
        });
        const abort = new AbortController();
        const reconciler = new DomainTlsReconciler(
            store,
            authority,
            registry,
            (domain, signal) => probeCertificate(nodes, domain.hostname, signal, trust),
            () => undefined,
        );
        try {
            expect(await registry.resolve(control.hostname)).toBeNull();
            for (const hostname of ["unknown.ulvia.test", "pending.ulvia.test"]) {
                const denied = await fetch(`http://127.0.0.1:5103/hosting/tls/permission?domain=${hostname}`);
                expect(denied.status).toBe(403);
                await denied.body?.cancel();
                expect(await probeCertificate(nodes, hostname, abort.signal, trust)).toBe(false);
            }
            const deadline = Date.now() + 60_000;
            while (!(await registry.resolve(control.hostname))) {
                await reconciler.batch(abort.signal);
                if (Date.now() >= deadline) {
                    throw new Error("ACME did not activate the registered Control domain");
                }
                await Bun.sleep(100);
            }
            expect((await store.getDomain(control.hostname))?.tls).toBe("ready");
            expect(await probeCertificate(nodes, control.hostname, abort.signal, ca)).toBe(false);
            expect(
                await probeCertificate(
                    [...nodes, { host: "proxy-b", port: 444 }],
                    control.hostname,
                    abort.signal,
                    trust,
                ),
            ).toBe(false);
            const page = await proxyReady(`https://${control.hostname}/`, trust);
            expect(page.status).toBe(200);
            expect(await page.json()).toEqual({ host: control.hostname });
            const forwarded = await fetch(`https://${control.hostname}/`, {
                tls: { ca: trust },
                headers: { host: `${control.hostname}:8443` },
                signal: AbortSignal.timeout(5000),
            });
            expect(await forwarded.json()).toEqual({ host: `${control.hostname}:8443` });
            const redirect = await fetch(`http://${control.hostname}/example?q=1`, {
                headers: { host: `${control.hostname}:8080` },
                redirect: "manual",
                signal: AbortSignal.timeout(5000),
            });
            expect(redirect.status).toBe(308);
            expect(redirect.headers.get("location")).toBe(`https://${control.hostname}/example?q=1`);
            await redirect.body?.cancel();
            const serials = await Promise.all(
                nodes.map((node) => certificateSerial(node.host, control.hostname, trust)),
            );
            expect(serials[0]).toBe(serials[1]);
            if (process.env.ULVIA_TEST_TLS_PHASE === "restart") {
                expect(serials).toEqual(await Bun.file("/trust/state.json").json());
            } else {
                await Bun.write("/trust/state.json", JSON.stringify(serials));
            }
            // A newly registered site needs no Caddy configuration change or dedicated upstream.
            const site = await registry.registerManaged("instance:site", "https://site.ulvia.test");
            const siteDeadline = Date.now() + 60_000;
            while (!(await registry.resolve(site.hostname))) {
                await reconciler.batch(abort.signal);
                if (Date.now() >= siteDeadline) {
                    throw new Error("Dynamic site TLS did not become ready");
                }
                await Bun.sleep(100);
            }
            const response = await fetch(`https://${site.hostname}/`, {
                tls: { ca: trust },
                signal: AbortSignal.timeout(5000),
            });
            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({ host: site.hostname });
            const current = (await store.getDomain(site.hostname))!;
            await registry.disable(
                { instanceId: "instance:control", subjectId: "admin" },
                site.hostname,
                current.revision,
            );
            const denied = await fetch(`http://127.0.0.1:5103/hosting/tls/permission?domain=${site.hostname}`);
            expect(denied.status).toBe(403);
            await denied.body?.cancel();
        } finally {
            abort.abort();
            await reconciler.drain();
            await runner.stopGracefully();
            upstream.stop(true);
        }
    },
    150_000,
);
