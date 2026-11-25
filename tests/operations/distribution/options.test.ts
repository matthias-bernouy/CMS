import { expect, test } from "bun:test";
import { publicationOptions } from "../../../infra/distribution/options";

test("publication phases are explicit while the existing command defaults to all", () => {
    expect(publicationOptions(["--version", "1.2.3"])).toEqual({ version: "1.2.3", phase: "all" });
    for (const phase of ["runtime", "catalogue", "all"] as const) {
        expect(publicationOptions(["--phase", phase, "--version", "1.2.3-beta.1"])).toEqual({
            version: "1.2.3-beta.1",
            phase,
        });
    }
});

for (const args of [
    [],
    ["--version"],
    ["--version", "1.2"],
    ["--version", "1.2.3", "--phase"],
    ["--version", "1.2.3", "--phase", "images"],
    ["--version", "1.2.3", "--phase", "runtime", "--phase", "catalogue"],
    ["--version", "1.2.3", "--version", "2.0.0"],
    ["--version", "1.2.3", "--unknown", "yes"],
]) {
    test(`invalid publish options refuse before effects: ${JSON.stringify(args)}`, () => {
        expect(() => publicationOptions(args)).toThrow("Usage");
    });
}
