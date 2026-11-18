import { expect, test } from "bun:test";
import { tlsProgram, CADDY_IMAGE } from "./configuration";

test("TLS service pins the real image and uses a private issuer with the actual Provider permission endpoint", () => {
    const built = tlsProgram();
    const config = JSON.parse(built.program);
    expect(CADDY_IMAGE).toMatch(/@sha256:[a-f0-9]{64}$/u);
    expect(config.apps.tls.automation.policies).toEqual([{ on_demand: true, issuers: [{ module: "internal" }] }]);
    expect(config.apps.tls.automation.on_demand.permission).toEqual({
        module: "http",
        endpoint: "http://ulvia-provider:5103/hosting/tls/permission",
    });
    expect(config.apps.http.servers.ulvia_https.listen).toEqual([":443"]);
    expect(config.apps.http.servers.ulvia_https.routes[0].handle[0].upstreams).toEqual([{ dial: "edge:3000" }]);
    expect(config.admin.disabled).toBe(true);
    expect(built.profile.programDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(tlsProgram()).toEqual(built);
    expect(built.program).not.toContain("acme");
});
