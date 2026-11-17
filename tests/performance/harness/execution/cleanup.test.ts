import { expect, test } from "bun:test";
import { Cleanup } from "./cleanup";

test("test resources close in reverse acquisition order and one failed release does not leak later resources", async () => {
    const cleanup = new Cleanup();
    const released: string[] = [];
    cleanup.add("probe", async () => {
        released.push("probe");
    });
    cleanup.add("stack", async () => {
        released.push("stack");
        throw new Error("private state");
    });
    cleanup.add("browser", async () => {
        released.push("browser");
    });
    const findings = await cleanup.close();
    expect(released).toEqual(["browser", "stack", "probe"]);
    expect(findings).toEqual([{ code: "cleanup-failed", message: "Could not release test-owned resource: stack" }]);
    expect(await cleanup.close()).toEqual([]);
    expect(released).toHaveLength(3);
});
