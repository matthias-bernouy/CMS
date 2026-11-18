import { expect, test } from "bun:test";
import { hostingPage, seekBefore } from "./pages";

test("hosting page oracles require bounded sorted unique rows and an exact seek cursor", () => {
    const first = { id: "instance:abc", status: "ready" };
    const second = { id: "instance:abd", status: "disabled" };
    expect(hostingPage({ items: [first, second], nextCursor: second.id }, 2, "id").keys).toEqual([first.id, second.id]);
    expect(() => hostingPage({ items: [first, first], nextCursor: first.id }, 2, "id")).toThrow();
    expect(() => hostingPage({ items: [second, first], nextCursor: null }, 2, "id")).toThrow();
    expect(() => hostingPage({ items: [first, second], nextCursor: null }, 1, "id")).toThrow();
    expect(() => hostingPage({ items: [first], nextCursor: "different" }, 1, "id")).toThrow();
    expect(seekBefore("sample.performance.test") < "sample.performance.test").toBe(true);
    expect(seekBefore("instance:abc")).toBe("instance:ab");
});
