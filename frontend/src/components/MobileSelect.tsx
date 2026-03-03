import { useState, useRef, useEffect } from 'react';

interface Option<T = number> {
  value: T;
  label: string;
}

interface Props<T extends number | string = number> {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  'aria-label'?: string;
}

/** Custom dropdown for mobile that stays below the bottom nav (z-index 99 < 100) */
export default function MobileSelect<T extends number | string = number>({ value, options, onChange, 'aria-label': ariaLabel }: Props<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div className="mobile-select-wrap" ref={ref}>
      <button
        type="button"
        className="mobile-select-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
      >
        {selected?.label ?? '—'}
      </button>
      {open && (
        <ul
          className="mobile-select-dropdown"
          role="listbox"
          aria-label={ariaLabel}
        >
          {options.map((o) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              className={`mobile-select-option ${o.value === value ? 'selected' : ''}`}
              onClick={() => {
                onChange(o.value as T);
                setOpen(false);
              }}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
