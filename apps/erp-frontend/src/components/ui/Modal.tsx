import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  icon?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  labelledBy?: string;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Centered dialog over a scrim (DESIGN.md §4 and §9).
 * The body scrolls inside a 92vh shell, focus is trapped while open, Escape
 * dismisses the dialog and focus returns to the element that opened it.
 */
export function Modal({
  open,
  onClose,
  title,
  eyebrow,
  icon,
  footer,
  children,
  labelledBy,
}: ModalProps) {
  const generatedId = useId();
  const titleId = labelledBy ?? `${generatedId}-title`;
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const activeElement = document.activeElement;
    triggerRef.current =
      activeElement instanceof HTMLElement ? activeElement : null;

    const dialog = dialogRef.current;
    const focusable = dialog?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    const firstFocusable =
      focusable && focusable.length > 0 ? focusable[0] : null;
    (firstFocusable ?? dialog)?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const items =
        dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);

      if (!items || items.length === 0) {
        event.preventDefault();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;

      if (event.shiftKey && current === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      triggerRef.current?.focus();
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="bg-sidebar/40 fixed inset-0 z-50 flex items-center justify-center p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="border-border bg-surface flex max-h-[92vh] w-full max-w-lg flex-col rounded-lg border shadow-lg outline-none"
      >
        <header className="border-border flex items-start justify-between gap-4 border-b px-5 py-4">
          <div className="flex items-start gap-3">
            {icon ? (
              <span className="text-text-muted mt-0.5 shrink-0">{icon}</span>
            ) : null}
            <div className="flex flex-col gap-1">
              {eyebrow ? (
                <span className="text-caption text-text-muted font-semibold tracking-wide uppercase">
                  {eyebrow}
                </span>
              ) : null}
              <h2 id={titleId} className="text-title text-text">
                {title}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="text-text-muted hover:text-text hover:bg-background inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-sm"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer ? (
          <footer className="border-border flex items-center justify-end gap-2 border-t px-5 py-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
