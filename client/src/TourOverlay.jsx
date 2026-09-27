import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { resolveTourTarget, tooltipTop, VIEWPORT_MARGIN } from "./tourPosition";

// Lightweight step-through walkthrough: no target measurement library, just
// getBoundingClientRect on the step's own target plus scrollIntoView. Steps are
// {ref | find, title, body} tuples supplied by the caller; the caller also owns
// switching tabs so a step's target actually exists in the DOM before this
// renders it.
function TourOverlay({ steps, stepIndex, onNext, onPrev, onClose }) {
  const [rect, setRect] = useState(null);
  const [tooltipHeight, setTooltipHeight] = useState(0);
  const tooltipRef = useRef(null);
  const step = steps[stepIndex];

  useLayoutEffect(() => {
    setTooltipHeight(tooltipRef.current?.offsetHeight ?? 0);
  }, [step, rect]);

  useEffect(() => {
    const node = resolveTourTarget(step);
    if (!node) {
      setRect(null);
      return;
    }
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    const measure = () => setRect(node.getBoundingClientRect());
    const t = setTimeout(measure, 260); // let the smooth scroll settle
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step]);

  if (!step) return null;

  const top = tooltipTop(rect, tooltipHeight, window.innerHeight);
  const left = rect ? Math.min(Math.max(rect.left, VIEWPORT_MARGIN), window.innerWidth - 316) : VIEWPORT_MARGIN;

  return (
    <div className="tour-overlay" role="dialog" aria-label="Guided walkthrough">
      {rect && (
        <div
          className="tour-spotlight"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
          }}
        />
      )}
      <div className="tour-tooltip" ref={tooltipRef} style={{ top, left }}>
        <p className="tour-step-count">
          Step {stepIndex + 1} of {steps.length}
        </p>
        <h4>{step.title}</h4>
        <p>{step.body}</p>
        <div className="tour-tooltip-actions">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Skip tour
          </button>
          <div className="tour-tooltip-nav">
            {stepIndex > 0 && (
              <button type="button" className="btn btn-outline" onClick={onPrev}>
                Back
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={onNext}>
              {stepIndex === steps.length - 1 ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Owns the running tour's steps and position. `start(steps)` begins at the
// first step; `overlay` is the rendered TourOverlay, or null when no tour runs.
export function useTour() {
  const [steps, setSteps] = useState(null);
  const [stepIndex, setStepIndex] = useState(0);

  const start = (tourSteps) => {
    if (tourSteps.length === 0) return;
    setSteps(tourSteps);
    setStepIndex(0);
  };
  const close = () => setSteps(null);
  const next = () => {
    if (stepIndex >= steps.length - 1) {
      close();
      return;
    }
    setStepIndex((i) => i + 1);
  };
  const prev = () => setStepIndex((i) => Math.max(0, i - 1));

  const overlay = steps ? (
    <TourOverlay steps={steps} stepIndex={stepIndex} onNext={next} onPrev={prev} onClose={close} />
  ) : null;

  return { start, overlay };
}
