import { IntegrationRuntimeError } from "../../../../core/errors";

export type SqlSourcePosition = { line: number; column: number };

export class SqlCursor {
    private index = 0;
    private line = 1;
    private column = 1;

    constructor(
        private readonly sql: string,
        private readonly path: string,
    ) {}

    get offset(): number {
        return this.index;
    }

    position(): SqlSourcePosition {
        return { line: this.line, column: this.column };
    }

    current(relativeOffset = 0): string {
        return this.sql[this.index + relativeOffset] ?? "";
    }

    at(offset: number): string {
        return this.sql[offset] ?? "";
    }

    slice(start: number, end: number): string {
        return this.sql.slice(start, end);
    }

    startsWith(value: string): boolean {
        return this.sql.startsWith(value, this.index);
    }

    done(): boolean {
        return this.index >= this.sql.length;
    }

    advanceMany(count: number): void {
        for (let offset = 0; offset < count; offset += 1) {
            this.advance();
        }
    }

    advance(): void {
        const current = this.sql[this.index];
        this.index += 1;
        if (current === "\r") {
            if (this.sql[this.index] === "\n") {
                this.index += 1;
            }
            this.line += 1;
            this.column = 1;
        } else if (current === "\n") {
            this.line += 1;
            this.column = 1;
        } else {
            this.column += 1;
        }
    }

    fail(message: string, position: SqlSourcePosition = this.position()): never {
        throw new IntegrationRuntimeError(`${this.path}:${position.line}:${position.column}: ${message}`);
    }
}

export function isSqlIdentifierStart(value: string): boolean {
    return value === "_" || /[A-Za-z\u0080-\u{10ffff}]/u.test(value);
}

export function isSqlIdentifierPart(value: string): boolean {
    return value === "$" || /[0-9]/u.test(value) || isSqlIdentifierStart(value);
}
