import { CString, dlopen, FFIType } from "bun:ffi";

const library = process.platform === "darwin" ? "/usr/lib/libSystem.B.dylib" : "libc.so.6";
const native = dlopen(library, { getenv: { args: [FFIType.ptr], returns: FFIType.ptr } });
const getenv = (name: string) => {
    const pointer = native.symbols.getenv(Buffer.from(`${name}\0`));
    return pointer ? String(new CString(pointer)) : undefined;
};
process.on("message", () => {
    process.send!({
        id: 1,
        vectors: [[getenv("ORT_DISABLE_TELEMETRY") === "1" ? 1 : 0, getenv("ULVIA_TEST_PARENT_SECRET") ? 1 : 0]],
    });
    native.close();
    process.disconnect();
});
