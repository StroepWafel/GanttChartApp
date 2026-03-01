import { useRef, useState, useCallback } from 'react';

const PULL_THRESHOLD = 80;
const RESISTANCE = 0.5;
/** Distance user must pull before the refresh indicator appears (reduces accidental triggers) */
const DEAD_ZONE = 28;

interface Props {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

export default function PullToRefresh({ onRefresh, children, disabled, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const startScrollTop = useRef(0);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled || refreshing) return;
      startY.current = e.touches[0].clientY;
      startScrollTop.current = containerRef.current?.scrollTop ?? 0;
    },
    [disabled, refreshing]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (disabled || refreshing) return;
      const el = containerRef.current;
      if (!el) return;
      const scrollTop = el.scrollTop;
      const canPull = scrollTop <= 0;
      if (!canPull) return;
      const deltaY = e.touches[0].clientY - startY.current;
      if (deltaY <= DEAD_ZONE) return;
      const effectiveDelta = deltaY - DEAD_ZONE;
      const resisted = Math.min(effectiveDelta * RESISTANCE, effectiveDelta);
      setPullDistance(resisted);
    },
    [disabled, refreshing]
  );

  const handleTouchEnd = useCallback(async () => {
    if (disabled || refreshing) return;
    if (pullDistance >= PULL_THRESHOLD) {
      setPullDistance(0);
      setRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
      }
    } else {
      setPullDistance(0);
    }
  }, [disabled, refreshing, pullDistance, onRefresh]);

  const showIndicator = pullDistance > 0 || refreshing;
  const progress = Math.min(pullDistance / PULL_THRESHOLD, 1);

  return (
    <div
      className={`pull-to-refresh ${className ?? ''}`.trim()}
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {showIndicator && (
        <div
          className="pull-to-refresh-indicator"
          style={{
            opacity: progress || (refreshing ? 1 : 0),
            transform: `translate(-50%, ${refreshing ? 0 : Math.min(pullDistance, 60)}px)`,
          }}
          aria-hidden
        >
          <div className={`pull-to-refresh-spinner ${refreshing ? 'pull-to-refresh-spinner-active' : ''}`} />
          <span className="pull-to-refresh-text">
            {refreshing ? 'Refreshing…' : pullDistance >= PULL_THRESHOLD ? 'Release to refresh' : 'Pull to refresh'}
          </span>
        </div>
      )}
      {children}
    </div>
  );
}
