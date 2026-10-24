import { expect, test } from "bun:test";
import { PageEditorSession } from "../../../packages/official-repository/collections/ulvia-official/blocs/admin/pages/ulvia-official-page-editor/runtime/controller/session";

test("ignores stale binding snapshots for the current Page", () => {
    const session = new PageEditorSession();

    expect(session.initialize("page-a", 2, "<main>Current</main>")).toBeTrue();
    expect(session.initialize("page-a", 1, "")).toBeFalse();
    expect(session.isDirty("<main>Current</main>")).toBeFalse();
});

test("accepts a newer revision or another Page", () => {
    const session = new PageEditorSession();

    expect(session.initialize("page-a", 1, "A1")).toBeTrue();
    expect(session.initialize("page-a", 2, "A2")).toBeTrue();
    expect(session.initialize("page-b", 1, "B1")).toBeTrue();
    expect(session.isDirty("B1")).toBeFalse();
});
