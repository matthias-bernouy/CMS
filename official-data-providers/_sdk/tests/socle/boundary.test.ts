import { test, expect } from "bun:test";
import { join } from "node:path";
import { sdkPackageRoot } from "src/constants";

// Normative guard (_sdk.md "Indépendance système") : the SDK MUST NOT import
// the CMS, the proxy, or auth-keycloak. Drift here would make the
// "découplage système" claim of base.md §4.8 a lie.
const FORBIDDEN = [
    "@bernouy/cms",            // covers cms, cms-blocs, cms-*-mt by prefix
    "@bernouy/mt-cms-control",
    "@bernouy/cms-delivery-mt",
    "@bernouy/auth-keycloak",
] as const;

function findForbidden(source: string): string[] {
    return FORBIDDEN.filter(
        (f) => source.includes(`"${f}`) || source.includes(`'${f}`),
    );
}

test("detector flags a forbidden import (self-test of the guard)", () => {
    expect(findForbidden(`import x from "@bernouy/cms";`)).toContain("@bernouy/cms");
    expect(findForbidden(`import x from "@bernouy/auth-keycloak";`)).toContain("@bernouy/auth-keycloak");
    expect(findForbidden(`import x from "@bernouy/core";`)).toHaveLength(0);
});

test("no SDK source file imports a forbidden package", async () => {
    const srcDir = join(sdkPackageRoot, "src");
    const offenders: string[] = [];
    for await (const file of new Bun.Glob("**/*.ts").scan({ cwd: srcDir })) {
        const text = await Bun.file(join(srcDir, file)).text();
        const hits = findForbidden(text);
        if (hits.length) offenders.push(`${file}: ${hits.join(", ")}`);
    }
    expect(offenders).toEqual([]);
});
