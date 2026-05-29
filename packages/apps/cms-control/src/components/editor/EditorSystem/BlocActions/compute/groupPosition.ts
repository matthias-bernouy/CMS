export type VAnchor = 'top' | 'bottom';

export type PositionInput = {
    rect: DOMRect;
    barWidth: number;
    barHeight: number;
    mouseX: number;
    mouseY: number;
};

/**
 * Places the floating action group above or below the bloc depending on
 * the cursor's Y position, and clamps its X inside the bloc's horizontal
 * span (then the viewport, so the bar never sits in an unreachable corner).
 */
export function computeGroupPosition(input: PositionInput): { x: number; y: number; vAnchor: VAnchor } {
    const { rect, barWidth, barHeight, mouseX, mouseY } = input;
    const margin = 8;
    const centerY = rect.top + rect.height / 2;
    let vAnchor: VAnchor = mouseY < centerY ? 'top' : 'bottom';

    if (vAnchor === 'top' && rect.top - barHeight < margin && rect.bottom + barHeight <= window.innerHeight - margin) {
        vAnchor = 'bottom';
    } else if (vAnchor === 'bottom' && rect.bottom + barHeight > window.innerHeight - margin && rect.top - barHeight >= margin) {
        vAnchor = 'top';
    }

    const halfWidth = barWidth / 2;
    let x = mouseX + window.scrollX - halfWidth;
    const minRectX = rect.left + window.scrollX;
    const maxRectX = rect.right + window.scrollX - barWidth;
    x = Math.max(minRectX, Math.min(maxRectX, x));
    const minViewX = window.scrollX + margin;
    const maxViewX = window.scrollX + window.innerWidth - barWidth - margin;
    x = Math.max(minViewX, Math.min(maxViewX, x));

    let y = vAnchor === 'top'
        ? rect.top + window.scrollY - barHeight
        : rect.bottom + window.scrollY;
    const minViewY = window.scrollY + margin;
    const maxViewY = window.scrollY + window.innerHeight - barHeight - margin;
    y = Math.max(minViewY, Math.min(maxViewY, y));

    return { x, y, vAnchor };
}
