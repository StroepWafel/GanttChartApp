import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronRight, ChevronLeft, MousePointerClick } from 'lucide-react';
import './GanttOnboarding.css';

export type OnboardingMode = 'prompt' | 'tour';

interface TourStep {
  target: string;
  title: string;
  content: string;
  actionHint?: string;
}

interface Props {
  mode: OnboardingMode;
  onYes: () => void;
  onNo: () => void;
  onLater: () => void;
  onTourComplete: () => void;
  onBeforeStep?: (stepIndex: number) => void;
}

const TOUR_STEPS: TourStep[] = [
  {
    target: 'sidebar',
    title: 'Categories & Projects',
    content: 'Organize tasks here. Categories contain projects, and projects contain tasks. Add categories with + Category / Project.',
    actionHint: 'Click the sidebar or expand it to continue',
  },
  {
    target: 'add-task',
    title: 'Create Tasks',
    content: 'Use this button to add tasks. Each task belongs to a project and has start/end dates, priority (1–10), and progress.',
    actionHint: 'Click the button to continue',
  },
  {
    target: 'view-modes',
    title: 'View Modes',
    content: 'Switch between Day, Week, and Month views to see your timeline at different scales.',
    actionHint: 'Click any view button to continue',
  },
  {
    target: 'priority-strip',
    title: 'Priority Colors',
    content: 'Task bars are colored by priority (1 = low, 10 = high). Adjust priority when editing a task.',
    actionHint: 'Click here to continue',
  },
  {
    target: 'gantt-chart',
    title: 'Task Actions',
    content: 'Right-click a task bar for Edit, Complete, Split, or Delete. Hover over wide bars for inline buttons. Drag the grip to reorder.',
    actionHint: 'Click the chart area to continue',
  },
  {
    target: 'resize-handle',
    title: 'Expand & Resize',
    content: 'Drag this divider to resize the task list. Click chevrons to expand or collapse categories and projects.',
    actionHint: 'Click here to finish',
  },
];

function getTargetSelector(step: TourStep, sidebarCollapsed: boolean): string {
  if (step.target === 'sidebar') {
    return sidebarCollapsed ? '[data-onboarding="sidebar-toggle"]' : '[data-onboarding="sidebar"]';
  }
  return `[data-onboarding="${step.target}"]`;
}

export default function GanttOnboarding({ mode, onYes, onNo, onLater, onTourComplete, onBeforeStep }: Props) {
  const [step, setStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean | null>(null);
  const rafRef = useRef<number>(0);

  const updateTargetRect = useCallback(() => {
    const currentStep = TOUR_STEPS[step];
    if (!currentStep) return;

    const collapsed = sidebarCollapsed ?? !document.querySelector('[data-onboarding="sidebar"]');
    if (step === 0 && sidebarCollapsed === null) setSidebarCollapsed(collapsed);

    const selector = getTargetSelector(currentStep, collapsed);
    const el = document.querySelector(selector);
    if (el) {
      setTargetRect(el.getBoundingClientRect());
    } else {
      setTargetRect(null);
    }
  }, [step, sidebarCollapsed]);

  useEffect(() => {
    if (mode !== 'tour') return;
    onBeforeStep?.(step);
    updateTargetRect();
    const delayTimer = setTimeout(updateTargetRect, 150);

    const resizeObserver = new ResizeObserver(updateTargetRect);
    const scrollHandler = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(updateTargetRect);
    };

    resizeObserver.observe(document.body);
    window.addEventListener('scroll', scrollHandler, true);
    window.addEventListener('resize', updateTargetRect);

    const interval = setInterval(updateTargetRect, 100);

    return () => {
      clearTimeout(delayTimer);
      clearInterval(interval);
      resizeObserver.disconnect();
      window.removeEventListener('scroll', scrollHandler, true);
      window.removeEventListener('resize', updateTargetRect);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [mode, step, updateTargetRect, onBeforeStep]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (mode === 'prompt') onLater();
        else onTourComplete();
      } else if (mode === 'tour') {
        if (e.key === 'ArrowRight' && step < TOUR_STEPS.length - 1) {
          e.preventDefault();
          setStep((s) => s + 1);
        } else if (e.key === 'ArrowLeft' && step > 0) {
          e.preventDefault();
          setStep((s) => s - 1);
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mode, step, onLater, onTourComplete]);

  const handleSpotlightClick = useCallback(() => {
    const currentStep = TOUR_STEPS[step];
    if (!currentStep) return;

    const el = document.querySelector(getTargetSelector(currentStep, sidebarCollapsed ?? false));
    const shouldTrigger = currentStep.target === 'sidebar' || currentStep.target === 'view-modes';
    if (el && el instanceof HTMLElement && shouldTrigger) {
      el.click();
    }

    if (step < TOUR_STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      onTourComplete();
    }
  }, [step, sidebarCollapsed, onTourComplete]);

  if (mode === 'prompt') {
    return (
      <div className="modal-overlay gantt-onboarding-overlay" onClick={onLater}>
        <div className="gantt-onboarding-modal gantt-onboarding-prompt" onClick={(e) => e.stopPropagation()}>
          <h3>Welcome to Gantt Chart</h3>
          <p className="gantt-onboarding-prompt-message">
            Would you like a guided tour? You&apos;ll interact with the interface step by step.
          </p>
          <div className="gantt-onboarding-prompt-actions">
            <button type="button" className="btn-sm" onClick={onLater}>
              Later
            </button>
            <button type="button" className="btn-sm" onClick={onNo}>
              No
            </button>
            <button type="button" className="btn-sm btn-sm-primary" onClick={onYes}>
              Start tour
            </button>
          </div>
        </div>
      </div>
    );
  }

  const current = TOUR_STEPS[step];
  const isFirst = step === 0;
  const isLast = step === TOUR_STEPS.length - 1;

  return (
    <div className="gantt-onboarding-guided">
      {!targetRect && (
        <div className="gantt-onboarding-backdrop" aria-hidden />
      )}
      {targetRect && (
        <div
          className="gantt-onboarding-spotlight"
          style={{
            top: targetRect.top - 8,
            left: targetRect.left - 8,
            width: targetRect.width + 16,
            height: targetRect.height + 16,
          }}
          title={current.actionHint ?? 'Click to continue'}
          onClick={handleSpotlightClick}
          role="button"
          tabIndex={0}
          aria-label={current.actionHint ?? 'Click to continue'}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleSpotlightClick();
            }
          }}
        >
          <div className="gantt-onboarding-spotlight-inner" />
        </div>
      )}
      <div className="gantt-onboarding-tooltip" role="dialog" aria-labelledby="onboarding-title" aria-describedby="onboarding-desc">
        <div className="gantt-onboarding-tooltip-header">
          <h3 id="onboarding-title">{current.title}</h3>
          <span className="gantt-onboarding-step-indicator">
            {step + 1} / {TOUR_STEPS.length}
          </span>
        </div>
        <p id="onboarding-desc" className="gantt-onboarding-tooltip-content">{current.content}</p>
        <div className="gantt-onboarding-tooltip-hint">
          <MousePointerClick size={14} />
          <span>{current.actionHint ?? 'Click the highlighted area to continue'}</span>
        </div>
        <div className="gantt-onboarding-tooltip-actions">
          <button
            type="button"
            className="btn-sm gantt-onboarding-nav"
            onClick={() => setStep((s) => s - 1)}
            disabled={isFirst}
            aria-label="Previous step"
          >
            <ChevronLeft size={16} />
            Previous
          </button>
          <div className="gantt-onboarding-dots">
            {TOUR_STEPS.map((_, i) => (
              <button
                key={i}
                type="button"
                className={`gantt-onboarding-dot ${i === step ? 'active' : ''}`}
                onClick={() => setStep(i)}
                aria-label={`Go to step ${i + 1}`}
                aria-current={i === step ? 'step' : undefined}
              />
            ))}
          </div>
          {isLast ? (
            <button type="button" className="btn-sm btn-sm-primary" onClick={onTourComplete}>
              Done
            </button>
          ) : (
            <button
              type="button"
              className="btn-sm gantt-onboarding-nav"
              onClick={() => setStep((s) => s + 1)}
              aria-label="Next step"
            >
              Skip
              <ChevronRight size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
