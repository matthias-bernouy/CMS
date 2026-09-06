import { afterEach, describe, expect, test } from "bun:test";
import { serializeForm } from "../../../src/binding/submit/formSubmit";
import { resetDom } from "../testUtils";
import { form } from "./formTestUtils";

afterEach(resetDom);

describe("explicit array form fields", () => {
    test.each([1, 2])("keeps %i submitted entries as an array and ordinary fields as scalars", (count) => {
        const target = form('<form><input name="title" value="Example"></form>');
        const values = ["first", "second"].slice(0, count);
        for (const value of values) {
            const input = document.createElement("input");
            input.name = "selections[]";
            input.value = value;
            target.append(input);
        }
        const serialized = serializeForm(target, { url: "/api/example", method: "POST" });
        expect(serialized.kind).toBe("json");
        expect(serialized.data).toEqual({ title: "Example", selections: values });
        if (serialized.kind === "json") {
            expect(JSON.parse(serialized.body)).toEqual({ title: "Example", selections: values });
        }
    });

    test("preserves singleton arrays inside structured request bodies", () => {
        const target = form(`
            <form>
                <input name="answers[name]" value="Ada">
                <input name="answers[interests][]" value="tennis">
            </form>
        `);
        expect(serializeForm(target, { url: "/api/example", method: "POST" }).data).toEqual({
            answers: { name: "Ada", interests: ["tennis"] },
        });
    });

    test("does not include inherited object members in explicit arrays", () => {
        const target = form('<form><input name="toString[]" value="first"></form>');
        expect(serializeForm(target, { url: "/api/example", method: "POST" }).data).toEqual({
            toString: ["first"],
        });
    });

    test("keeps unsafe, malformed and conflicting paths literal", () => {
        const target = form(`
            <form>
                <input name="answers" value="plain">
                <input name="answers[interests][]" value="tennis">
                <input name="payload[__proto__][polluted][]" value="yes">
                <input name="__proto__[]" value="unsafe">
                <input name="items[][]" value="unsupported">
            </form>
        `);
        expect(serializeForm(target, { url: "/api/example", method: "POST" }).data).toEqual({
            answers: "plain",
            "answers[interests][]": "tennis",
            "payload[__proto__][polluted][]": "yes",
            "__proto__[]": "unsafe",
            "items[][]": "unsupported",
        });
        expect(({} as { polluted?: string }).polluted).toBeUndefined();
    });

    test("retains browser field names for query and multipart transports", () => {
        const target = form('<form><input name="selections[]" value="first"></form>');
        const query = serializeForm(target, { url: "/api/example", method: "GET" });
        expect(new URL(query.url).searchParams.getAll("selections[]")).toEqual(["first"]);
        const formData = query.formData;
        formData.append("file", new File(["content"], "example.txt"));
        const upload = serializeForm(target, { url: "/api/example", method: "POST", formData });
        expect(upload.kind).toBe("formData");
        expect(upload.formData.getAll("selections[]")).toEqual(["first"]);
        expect(upload.data.selections).toEqual(["first"]);
    });
});
