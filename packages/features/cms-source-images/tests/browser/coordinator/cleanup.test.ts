import { test } from "bun:test";
import { runIsolatedTestFixture } from "../runIsolatedTestFixture";

test("runs bound image cleanup in an isolated DOM process", () => {
    runIsolatedTestFixture(new URL("./cleanup.fixture.ts", import.meta.url));
});
