import { afterEach, expect, test } from "bun:test";
import { MutationRequest } from "../../../src/browser/binding/runtime/mutation/MutationRequest";
import { resetDom } from "../support/testUtils";
import { form } from "../form/formTestUtils";

afterEach(resetDom);
const url = "/.cms/mutation/ulvia/test.users/create";
function submission() {
    location.href = "http://localhost/";
    const target = form('<form><input name="email" value="ada@example.com"></form>');
    const request = new MutationRequest(target, {});
    return { target, request, captured: request.capture(url)! };
}

test("live mutation transport sends serialized form JSON and preserves a successful response", async () => {
    const { target, request, captured } = submission();
    const controller = new AbortController();
    globalThis.fetch = (async (input, init) => {
        expect(input).toBe(`http://localhost${url}`);
        expect(init?.method).toBe("POST");
        expect(init?.signal).toBe(controller.signal);
        expect(init?.body).toBe(JSON.stringify({ email: "ada@example.com" }));
        const headers = new Headers(init?.headers);
        expect(headers.get("Content-Type")).toBe("application/json");
        expect(headers.get("Accept")).toBe("application/json");
        expect(headers.get("X-Ulvia-Automatic-Idempotency-Key")).toBe(captured.automaticIdempotencyKey);
        return Response.json({ id: "created" }, { status: 201, headers: { "x-ulvia-request-id": "request-created" } });
    }) as typeof fetch;
    expect(await request.send(captured, controller.signal)).toEqual({
        ok: true,
        status: 201,
        statusText: "OK",
        body: { id: "created" },
        message: "",
        form: target,
        outcome: { kind: "success", status: 201, requestId: "request-created" },
    });
    expect(target.querySelector<HTMLInputElement>("input")!.value).toBe("ada@example.com");
});

test("live mutation transport preserves declared refusals and leaves form controls unchanged", async () => {
    const { target, request, captured } = submission();
    globalThis.fetch = (async () =>
        Response.json(
            { error: { code: "INVALID_INPUT", retryable: false, output: { field: "email" } } },
            { status: 422, headers: { "x-ulvia-request-id": "request-refused" } },
        )) as typeof fetch;
    expect(await request.send(captured, new AbortController().signal)).toEqual({
        ok: false,
        status: 422,
        statusText: "Command rejected",
        body: { field: "email" },
        message: "INVALID_INPUT",
        form: target,
        outcome: {
            kind: "error",
            code: "INVALID_INPUT",
            retryable: false,
            output: { field: "email" },
            status: 422,
            requestId: "request-refused",
        },
    });
    expect(target.querySelector<HTMLInputElement>("input")!.value).toBe("ada@example.com");
});

test("live mutation transport normalizes network failure without leaking its diagnostic", async () => {
    const { target, request, captured } = submission();
    globalThis.fetch = (async () => {
        throw new Error("private offline diagnostic");
    }) as typeof fetch;
    expect(await request.send(captured, new AbortController().signal)).toEqual({
        ok: false,
        status: 0,
        statusText: "Mutation failed",
        body: null,
        message: "network_error",
        form: target,
        outcome: { kind: "failure", code: "network_error", retryable: true },
    });
});

test("live mutation transport forwards cancellation and reports a nonretryable aborted outcome", async () => {
    const { target, request, captured } = submission();
    const controller = new AbortController();
    globalThis.fetch = ((_input, init) =>
        new Promise<Response>((_resolve, reject) => {
            expect(init?.signal).toBe(controller.signal);
            init!.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), {
                once: true,
            });
        })) as typeof fetch;
    const sending = request.send(captured, controller.signal);
    controller.abort();
    expect(await sending).toEqual({
        ok: false,
        status: 0,
        statusText: "Mutation failed",
        body: null,
        message: "aborted",
        form: target,
        outcome: { kind: "failure", code: "aborted", retryable: false },
    });
});

test("live mutation transport rejects malformed success JSON", async () => {
    const { request, captured } = submission();
    globalThis.fetch = (async () => new Response("{invalid", { status: 200 })) as typeof fetch;
    expect(await request.send(captured, new AbortController().signal)).toMatchObject({
        ok: false,
        status: 200,
        body: null,
        message: "invalid_response",
        outcome: { kind: "failure", code: "invalid_response", retryable: false, status: 200 },
    });
});
