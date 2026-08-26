import { test } from "bun:test";
import { runIsolatedTestFixture } from "../runIsolatedTestFixture";

test("runs the bound image lifecycle in an isolated DOM process", () => {
    runIsolatedTestFixture(new URL("./lifecycle.fixture.ts", import.meta.url));
});
