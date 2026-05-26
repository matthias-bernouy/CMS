import { test, expect } from "bun:test";
import { join } from "node:path";
import { issuerKitPackageRoot } from "src/constants";

// The issuer-kit is the SIGN side. It MUST NOT import the SDK (verify side),
// the CMS, or auth-keycloak. The only shared wire contract it may use is
// `@bernouy/tenant-provisioner-contract`. Drift here would break the
// sign↔verify decoupling the architecture relies on.
const FORBIDDEN = [
    "@bernouy/tenant-provisioner-sdk",
    "@bernouy/cms",
    "@bernouy/mt-cms-control",
    "@bernouy/auth-keycloak",
] as const;

function findForbidden(source: string): string[] {
    return FORBIDDEN.filter((f) => source.includes(`"${f}`) || source.includes(`'${f}`));
}

test("detector flags a forbidden import (self-test of the guard)", () => {
    expect(findForbidden(`import x from "@bernouy/tenant-provisioner-sdk";`)).toContain("@bernouy/tenant-provisioner-sdk");
    expect(findForbidden(`import x from "@bernouy/cms";`)).toContain("@bernouy/cms");
    expect(findForbidden(`import x from "@bernouy/tenant-provisioner-contract";`)).toHaveLength(0);
    expect(findForbidden(`import x from "@bernouy/core";`)).toHaveLength(0);
});

test("no issuer-kit source imports a forbidden package", async () => {
    const srcDir = join(issuerKitPackageRoot, "src");
    const offenders: string[] = [];
    for await (const file of new Bun.Glob("**/*.ts").scan({ cwd: srcDir })) {
        const text = await Bun.file(join(srcDir, file)).text();
        const hits = findForbidden(text);
        if (hits.length) offenders.push(`${file}: ${hits.join(", ")}`);
    }
    expect(offenders).toEqual([]);
});
