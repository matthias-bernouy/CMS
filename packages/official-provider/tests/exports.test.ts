import { expect, test } from "bun:test";

test("the official provider publishes its executable server entrypoint", () => {
    expect(import.meta.resolve("@bernouy/ulvia-official-provider/server")).toEndWith("/src/server.ts");
});
