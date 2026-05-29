export class ResizeInstance {
    private isResizing = false;
    private hasMoved = false;
    private isPending = false;
    private originX = 0;
    private originY = 0;
    private lastMouseX = 0;
    private lastMouseY = 0;

    private startWidth = 0;
    private startHeight = 0;
    private aspectRatio = 1;

    private static MOVE_THRESHOLD = 4;

    private target: HTMLElement;
    private onResizeCallback: (width: number, height: number) => void;

    constructor(target: HTMLElement, onResize: (width: number, height: number) => void) {
        this.target = target;
        this.onResizeCallback = onResize;
        this.target.style.position = "relative";
    }

    public start(): void {
        this.target.style.cursor = "nwse-resize";
        this.target.addEventListener("mousedown", this.onMouseDown);
        this.target.addEventListener("click", this.preventClickIfResizing, true);
    }

    public stop(): void {
        this.target.style.cursor = "default";
        this.target.removeEventListener("mousedown", this.onMouseDown);
        this.target.removeEventListener("click", this.preventClickIfResizing, true);
        this.onMouseUp();
    }

    private onMouseDown = (e: MouseEvent): void => {
        if (e.target === this.target) {
            this.isPending = true;
            this.isResizing = false;
            this.hasMoved = false;
            this.originX = e.clientX;
            this.originY = e.clientY;
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;

            this.startWidth = this.target.offsetWidth;
            this.startHeight = this.target.offsetHeight;
            this.aspectRatio = this.startWidth / this.startHeight;

            document.addEventListener("mousemove", this.onMouseMove);
            document.addEventListener("mouseup", this.onMouseUp);

            e.preventDefault();
        }
    };

    private onMouseMove = (e: MouseEvent): void => {
        if (!this.isPending && !this.isResizing) return;

        // Activate resize only after moving past the threshold
        if (this.isPending && !this.isResizing) {
            const dx = Math.abs(e.clientX - this.originX);
            const dy = Math.abs(e.clientY - this.originY);
            if (dx < ResizeInstance.MOVE_THRESHOLD && dy < ResizeInstance.MOVE_THRESHOLD) return;
            this.isPending = false;
            this.isResizing = true;
        }

        this.hasMoved = true;

        const deltaX = e.clientX - this.lastMouseX;
        const deltaY = e.clientY - this.lastMouseY;

        let newWidth = this.target.offsetWidth + deltaX;
        let newHeight = this.target.offsetHeight + deltaY;

        if (!e.shiftKey) {
            if (Math.abs(deltaX) > Math.abs(deltaY)) {
                newHeight = newWidth / this.aspectRatio;
            } else {
                newWidth = newHeight * this.aspectRatio;
            }
        }

        newWidth = Math.max(10, newWidth);
        newHeight = Math.max(10, newHeight);

        this.onResizeCallback(newWidth, newHeight);

        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
    };

    private onMouseUp = (): void => {
        this.isPending = false;
        setTimeout(() => {
            this.isResizing = false;
        }, 0);
        document.removeEventListener("mousemove", this.onMouseMove);
        document.removeEventListener("mouseup", this.onMouseUp);
    };

    private preventClickIfResizing = (e: MouseEvent): void => {
        if (this.hasMoved) {
            e.stopImmediatePropagation();
            e.preventDefault();
            this.hasMoved = false;
        }
    };
}