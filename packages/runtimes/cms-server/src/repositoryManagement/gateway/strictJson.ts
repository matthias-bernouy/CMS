import { assertIJsonValue } from "@bernouy/cms-integration-packages";

const MAX_JSON_DEPTH = 64;
const NUMBER = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;

export function parseStrictRepositoryJson(bytes: Uint8Array): unknown {
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
        throw new TypeError("Repository management JSON is invalid");
    }
    const source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    new JsonShapeScanner(source).scan();
    const value = JSON.parse(source) as unknown;
    assertIJsonValue(value);
    return value;
}

class JsonShapeScanner {
    private offset = 0;

    constructor(private readonly source: string) {}

    scan(): void {
        this.value(0);
        this.whitespace();
        if (this.offset !== this.source.length) {
            this.invalid();
        }
    }

    private value(depth: number): void {
        this.whitespace();
        const token = this.source[this.offset];
        if (token === "{") {
            this.object(depth + 1);
            return;
        }
        if (token === "[") {
            this.list(depth + 1);
            return;
        }
        if (token === '"') {
            this.string();
            return;
        }
        if (token === "t" || token === "f" || token === "n") {
            this.literal(token === "t" ? "true" : token === "f" ? "false" : "null");
            return;
        }
        NUMBER.lastIndex = this.offset;
        const number = NUMBER.exec(this.source);
        if (!number) {
            this.invalid();
        }
        this.offset = NUMBER.lastIndex;
    }

    private object(depth: number): void {
        this.assertDepth(depth);
        this.offset += 1;
        this.whitespace();
        if (this.consume("}")) {
            return;
        }
        const keys = new Set<string>();
        while (true) {
            this.whitespace();
            const key = this.string();
            if (keys.has(key)) {
                this.invalid();
            }
            keys.add(key);
            this.whitespace();
            this.expect(":");
            this.value(depth);
            this.whitespace();
            if (this.consume("}")) {
                return;
            }
            this.expect(",");
        }
    }

    private list(depth: number): void {
        this.assertDepth(depth);
        this.offset += 1;
        this.whitespace();
        if (this.consume("]")) {
            return;
        }
        while (true) {
            this.value(depth);
            this.whitespace();
            if (this.consume("]")) {
                return;
            }
            this.expect(",");
        }
    }

    private string(): string {
        const start = this.offset;
        this.expect('"');
        while (this.offset < this.source.length) {
            const token = this.source[this.offset++];
            if (token === '"') {
                return JSON.parse(this.source.slice(start, this.offset)) as string;
            }
            if (token === "\\") {
                const escape = this.source[this.offset++];
                if (escape === "u") {
                    for (let index = 0; index < 4; index += 1) {
                        if (!/[0-9a-f]/iu.test(this.source[this.offset++] ?? "")) {
                            this.invalid();
                        }
                    }
                } else if (!escape || !'"\\/bfnrt'.includes(escape)) {
                    this.invalid();
                }
            } else if (!token || token.charCodeAt(0) < 0x20) {
                this.invalid();
            }
        }
        return this.invalid();
    }

    private literal(value: string): void {
        if (!this.source.startsWith(value, this.offset)) {
            this.invalid();
        }
        this.offset += value.length;
    }

    private whitespace(): void {
        while (this.offset < this.source.length) {
            const token = this.source.charCodeAt(this.offset);
            if (token !== 0x09 && token !== 0x0a && token !== 0x0d && token !== 0x20) {
                return;
            }
            this.offset += 1;
        }
    }

    private expect(value: string): void {
        if (!this.consume(value)) {
            this.invalid();
        }
    }

    private consume(value: string): boolean {
        if (this.source[this.offset] !== value) {
            return false;
        }
        this.offset += 1;
        return true;
    }

    private assertDepth(depth: number): void {
        if (depth > MAX_JSON_DEPTH) {
            this.invalid();
        }
    }

    private invalid(): never {
        throw new TypeError("Repository management JSON is invalid");
    }
}
