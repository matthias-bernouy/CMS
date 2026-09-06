export class PreviewObservers {
    private visibility?: IntersectionObserver;
    private sizing?: ResizeObserver;

    observe(root: ShadowRoot): void {
        this.disconnect();
        this.visibility = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (!entry.isIntersecting) {
                        continue;
                    }
                    const frame = entry.target as HTMLIFrameElement;
                    frame.src = frame.dataset.previewSrc!;
                    this.visibility?.unobserve(frame);
                }
            },
            { rootMargin: "120px" },
        );
        this.sizing = new ResizeObserver((entries) => {
            for (const entry of entries) {
                (entry.target as HTMLElement).style.setProperty(
                    "--preview-scale",
                    String(entry.contentRect.width / 900),
                );
            }
        });
        for (const frame of Array.from(root.querySelectorAll<HTMLIFrameElement>("iframe[data-preview-src]"))) {
            this.visibility.observe(frame);
            this.sizing.observe(frame.parentElement!);
        }
    }

    disconnect(): void {
        this.visibility?.disconnect();
        this.sizing?.disconnect();
    }
}
