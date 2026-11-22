import { expect, test } from "bun:test";
import { listPage } from "./oracles";
test("Forms list oracles reject omissions, duplicates, foreign identities and payload leaks", () => {
    const ids = ["a", "b"];
    listPage({ forms: ids.map((id) => ({ id })) }, ids);
    for (const forms of [
        [{ id: "a" }],
        [{ id: "a" }, { id: "a" }],
        [{ id: "a" }, { id: "foreign" }],
        [{ id: "a", draft: {} }, { id: "b" }],
        [{ id: "b" }, { id: "a" }],
    ]) {
        expect(() => listPage({ forms }, ids)).toThrow();
    }
    expect(() => listPage({ forms: ids.map((id) => ({ id })), next: "unexpected" }, ids)).toThrow();
});
