import { test } from "bun:test";
import { runIsolatedTestFixture } from "./support/runIsolatedTestFixture";

test("runs the Shell suite in an isolated DOM process", () => {
    runIsolatedTestFixture(new URL("./support/shell.fixture.ts", import.meta.url));
});
