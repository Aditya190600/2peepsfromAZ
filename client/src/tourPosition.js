// A step's target is either a ref (`ref`, for elements the page always
// renders) or a lookup (`find`, for elements that only exist for some data,
// e.g. the first scenario card) - null when the target isn't in the DOM.
export function resolveTourTarget(step) {
  return step?.ref?.current ?? step?.find?.() ?? null;
}

const TOOLTIP_GAP = 12;
export const VIEWPORT_MARGIN = 16;

// Places the tooltip below the target when it fits, else above it, else
// clamped inside the viewport - so a target near the bottom of the page (which
// scrollIntoView can't center) never pushes the tooltip off-screen.
export function tooltipTop(rect, tooltipHeight, viewportHeight) {
  if (!rect) return Math.max(VIEWPORT_MARGIN, (viewportHeight - tooltipHeight) / 2);
  const below = rect.bottom + TOOLTIP_GAP;
  if (below + tooltipHeight <= viewportHeight - VIEWPORT_MARGIN) return below;
  const above = rect.top - TOOLTIP_GAP - tooltipHeight;
  if (above >= VIEWPORT_MARGIN) return above;
  return Math.max(VIEWPORT_MARGIN, viewportHeight - VIEWPORT_MARGIN - tooltipHeight);
}
