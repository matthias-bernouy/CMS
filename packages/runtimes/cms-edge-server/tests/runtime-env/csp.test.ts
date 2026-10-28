import { expect, test } from "bun:test";
import { parseCspPolicy } from "../../src/cspPolicy";
test("operator CSP policy accepts exact origins and rejects wildcards and directive injection", () => {
    expect(parseCspPolicy('{"frame":["https://maps.test"]}').frameExtras).toEqual(["https://maps.test"]);
    for (const value of [
        '{"frame":["*"]}',
        '{"frame":["https://maps.test/path"]}',
        '{"script":["https://evil.test; unsafe-inline"]}',
        '{"script":["https://user:secret@host.test"]}',
        '{"unknown":[]}',
    ]) {
        expect(() => parseCspPolicy(value)).toThrow();
    }
});
