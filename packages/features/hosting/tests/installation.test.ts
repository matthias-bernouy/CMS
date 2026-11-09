import { expect, test } from "bun:test";
import { reserveHostingInstallation, hostingOrigin, domainHostname } from "@bernouy/hosting";
import { InMemoryHostingStore } from "@bernouy/hosting/memory";
import { fixture } from "./fixture";
import { readDomain, readInstallation } from "../src/default-implementation/state";

test("concurrent initializations retain one immutable Control reservation", async () => {
    const store = new InMemoryHostingStore();
    const reservations = await Promise.all(
        Array.from({ length: 32 }, () => reserveHostingInstallation(store, "https://Control.Example/")),
    );
    expect(new Set(reservations.map((item) => item.controlKey)).size).toBe(1);
    expect(reservations[0]!.controlOrigin).toBe("https://control.example");
    await store.bindControl(1, "tenant-1");
    const before = await store.readInstallation();
    await expect(reserveHostingInstallation(store, "https://other.example")).rejects.toMatchObject({
        code: "CONFLICT",
    });
    await expect(store.bindControl(2, "tenant-2")).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await store.readInstallation()).toEqual(before);
});

test("a site named control or a stale administrator has no hosting authority", async () => {
    const f = await fixture();
    await f.authority.assertAdministrator(f.actor);
    await expect(
        f.authority.assertAdministrator({ instanceId: "control", subjectId: "administrator" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
        f.authority.assertAdministrator({ instanceId: "site-a", subjectId: "administrator" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    f.setAdmin(false);
    await expect(f.authority.assertAdministrator(f.actor)).rejects.toMatchObject({ code: "FORBIDDEN" });
});

test("persisted mandatory fields cannot be defaulted or repaired", async () => {
    const f = await fixture();
    const installation = await f.store.readInstallation();
    expect(() => readInstallation({ ...installation, controlInstanceId: undefined })).toThrow();
    expect(() => readInstallation({ ...installation, format: "ulvia-hosting/v0" })).toThrow();
    const domain = await f.domains.registerManaged("site-a", "http://a.localhost");
    expect(() => readDomain({ ...domain, revision: undefined })).toThrow();
    expect(() => readDomain({ ...domain, origin: "https://other.example" })).toThrow();
    expect(() => readDomain({ ...domain, origin: "https://a.example", hostname: "a.example" })).toThrow();
});

test("origin normalization rejects credentials, paths, IPs and insecure remote origins", () => {
    expect(domainHostname("BÜCHER.Example.")).toBe("xn--bcher-kva.example");
    expect(hostingOrigin("http://Control.Localhost:8080")).toEqual({
        origin: "http://control.localhost:8080",
        hostname: "control.localhost",
        local: true,
    });
    for (const origin of [
        "http://remote.example",
        "https://u:p@example.com",
        "https://example.com/path",
        "https://example.com?x=1",
        "https://127.0.0.1",
        "https://[::1]",
        " https://example.com",
        "https://bad_name.example",
    ]) {
        expect(() => hostingOrigin(origin)).toThrow();
    }
    for (const hostname of [
        "example.com:443",
        "example.com/path",
        "a..example",
        "*.example.com",
        "127.0.0.1",
        "a\\b.example",
    ]) {
        expect(() => domainHostname(hostname)).toThrow();
    }
});
