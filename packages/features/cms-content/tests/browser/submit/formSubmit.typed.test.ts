import { afterEach, expect, test } from "bun:test";
import { serializeForm } from "../../../src/browser/binding/submit/formSerialization";
import { resetDom } from "../support/testUtils";
import { form } from "./formTestUtils";

afterEach(resetDom);
const encode = (fields: string, mode = 'cms-source-serialization="typed-json"') =>
    serializeForm(form(`<form ${mode}>${fields}</form>`), { url: "/save", method: "POST" }).data;

test("typed JSON builds nested values and preserves explicit false, zero, null and empty arrays", () => {
    expect(
        encode(`<input name="metadata[weight]" type="number" value="0">
        <input name="enabled" type="checkbox"><input name="brandId" cms-form-empty="null">
        <select name="categories" multiple></select><input name="optional" cms-form-empty="omit">
        <input name="rows[0][title]" value="A"><input name="rows[1][title]" value="B">
        <input name="published" cms-form-value-type="boolean" value="false">`),
    ).toEqual({
        metadata: { weight: 0 },
        enabled: false,
        brandId: null,
        categories: [],
        rows: [{ title: "A" }, { title: "B" }],
        published: false,
    });
});

test("typed JSON accepts an explicit bounded JSON control value", () => {
    expect(encode('<textarea name="targets" cms-form-value-type="json">[{"digest":"sha256:abc"}]</textarea>')).toEqual({
        targets: [{ digest: "sha256:abc" }],
    });
    expect(() => encode('<textarea name="targets" cms-form-value-type="json">[</textarea>')).toThrow("Invalid JSON");
});

test("read-only and disabled controls do not contribute to typed JSON", () => {
    expect(
        encode(
            '<input name="a" readonly value="A"><input name="b" disabled value="B"><input value="C"><input name="d" value="D">',
        ),
    ).toEqual({ d: "D" });
});

test.each([
    '<input name="price" cms-form-value-type="number" value="NaN">',
    '<input name="flag" cms-form-value-type="boolean" value="yes">',
    '<input name="a" value="1"><input name="a" value="2">',
    '<input name="a" value="1"><input name="a[b]" value="2">',
    '<input name="a[__proto__][b]" value="2">',
    '<input name="rows[1][title]" value="B">',
    '<input name="a.b" value="2">',
    '<input name="a" cms-form-empty="erase">',
])("invalid typed values or paths block serialization: %s", (fields) => {
    expect(() => encode(fields)).toThrow();
});

test("ordinary forms keep string values and repeated names; typed append paths are explicit", () => {
    const fields = '<input name="tag" value="a"><input name="tag" value="b"><input name="n" type="number" value="0">';
    expect(encode(fields, "")).toEqual({ tag: ["a", "b"], n: "0" });
    expect(encode(fields.replaceAll('name="tag"', 'name="tag[]"'))).toEqual({ tag: ["a", "b"], n: 0 });
});

test("typed JSON cannot silently turn a GET into a write", () => {
    const target = form('<form cms-source-serialization="typed-json"><input name="a" value="b"></form>');
    expect(() => serializeForm(target, { url: "/read", method: "GET" })).toThrow("request body");
});
