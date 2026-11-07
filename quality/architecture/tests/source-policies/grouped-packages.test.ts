import { expect, test } from "bun:test";
import { checkWorkspaceArchitecture } from "../../core/checkWorkspace";
import { createWorkspaceFixture, manifest, ofKind } from "../checkWorkspace.fixture";

const { createWorkspace } = createWorkspaceFixture();

test("grouped feature packages retain import-direction and environment-read enforcement", async () => {
    const root = await createWorkspace({
        "packages/features/email/base/package.json": manifest("@fixture/email", { exports: { ".": "./src/index.ts" } }),
        "packages/features/email/base/src/index.ts": "export const value = process.env.TOKEN;\n",
        "packages/platform/sdk/package.json": manifest("@fixture/sdk", {
            dependencies: { "@fixture/email": "workspace:*" },
        }),
        "packages/platform/sdk/src/index.ts": 'import { value } from "@fixture/email"; export { value };\n',
    });
    const violations = await checkWorkspaceArchitecture({ rootDir: root });
    expect(ofKind(violations, "environment-read")).toHaveLength(1);
    expect(violations.some(({ message }) => message.includes("@fixture/email"))).toBe(true);
});
