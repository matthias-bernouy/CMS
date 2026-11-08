export interface BlocStyleInput {
    readonly id: string;
    readonly kind: "component" | "composition";
    readonly uses: readonly string[];
    readonly style?: string;
    readonly runtime?: Readonly<{ viewJS: string }>;
}
