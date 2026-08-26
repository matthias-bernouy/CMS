import { test } from "bun:test";
import { runIsolatedTestFixture } from "../../support/runIsolatedTestFixture";

test("runs Shell page-state bindings in an isolated DOM process", () => {
    runIsolatedTestFixture(new URL("./shellPageState.fixture.ts", import.meta.url));
});
