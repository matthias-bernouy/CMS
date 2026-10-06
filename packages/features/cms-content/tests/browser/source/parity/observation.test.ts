import { afterEach, expect, test } from "bun:test";
import { Source } from "../../../../src/browser/binding/source/Source";
import { observeSource, type SourceObservation } from "../../../../src/browser/binding/source/runtime/observation";
import { el, resetDom } from "../../support/testUtils";

afterEach(resetDom);

test("source observation follows loading, refresh failure, empty data and disposal", async () => {
    const host = el(
        '<div cms-source="/items"><p>{{ name }}</p><p cms-condition="$source.error">{{ $source.message }}</p></div>',
    );
    const source = new Source(host);
    let response = Response.json({ name: "Ada" });
    globalThis.fetch = (async () => response) as unknown as typeof fetch;
    const states: SourceObservation[] = [];
    const stop = observeSource(host, (state) => {
        states.push(state);
        if (state.loaded) {
            expect(host.textContent).toContain("Ada");
        }
    });
    await source.run();
    expect(states.map((state) => [state.loading, state.loaded])).toEqual([
        [true, false],
        [false, true],
    ]);
    response = new Response("Unavailable", { status: 503 });
    await source.run();
    expect(states.at(-2)).toMatchObject({ loading: false, loaded: true, refreshing: true, refreshError: false });
    expect(states.at(-1)).toMatchObject({
        loading: false,
        loaded: true,
        error: false,
        refreshing: false,
        refreshError: true,
        status: 503,
        data: { name: "Ada" },
    });
    response = Response.json([]);
    await source.run();
    expect(states.at(-1)).toMatchObject({ empty: true, data: [] });
    source.dispose();
    expect(states.at(-1)).toMatchObject({ disposed: true, data: undefined });
    stop();
    const late: SourceObservation[] = [];
    observeSource(host, (state) => late.push(state))();
    expect(late).toEqual([]);
});

test("superseded source responses never reach observers", async () => {
    const host = el('<div cms-source="/items"><p>{{ name }}</p></div>');
    const source = new Source(host);
    const responses: ((response: Response) => void)[] = [];
    globalThis.fetch = (() => new Promise<Response>((resolve) => responses.push(resolve))) as unknown as typeof fetch;
    const data: unknown[] = [];
    observeSource(host, (state) => {
        if (state.loaded) {
            data.push(state.data);
        }
    });
    const first = source.run();
    const second = source.run();
    responses[1]!(Response.json({ name: "Current" }));
    await second;
    responses[0]!(Response.json({ name: "Stale" }));
    await first;
    expect(data).toEqual([{ name: "Current" }]);
    let replay: unknown;
    const stop = observeSource(host, (state) => {
        replay = state.data;
    });
    expect(replay).toEqual({ name: "Current" });
    stop();
    source.dispose();
    expect(replay).toEqual({ name: "Current" });
});
