declare module "libheif-js" {
    const libheif: {
        HeifDecoder: new () => {
            decode(source: Uint8Array): Array<{
                get_width(): number;
                get_height(): number;
                display(
                    target: { data: Uint8ClampedArray; width: number; height: number },
                    callback: (result: { data: Uint8ClampedArray; width: number; height: number } | null) => void,
                ): void;
            }>;
        };
    };
    export default libheif;
}
