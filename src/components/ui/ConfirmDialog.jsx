import { useEffect, useRef } from 'react';

/**
 * ConfirmDialog - Reusable confirmation modal for destructive actions
 *
 * @param {Object} props
 * @param {boolean} props.open - Whether the dialog is open
 * @param {Function} props.onClose - Callback when dialog is closed
 * @param {Function} props.onConfirm - Callback when user confirms
 * @param {string} props.title - Dialog title
 * @param {string} props.message - Confirmation message
 * @param {string} [props.confirmText='Confirm'] - Text for confirm button
 * @param {string} [props.cancelText='Cancel'] - Text for cancel button
 * @param {'danger'|'warning'|'info'} [props.variant='danger'] - Visual variant
 * @param {boolean} [props.loading=false] - Whether action is in progress
 */
export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  loading = false
}) {
  const confirmButtonRef = useRef(null);

  useEffect(() => {
    if (open && confirmButtonRef.current) {
      // Focus confirm button when dialog opens for keyboard accessibility
      confirmButtonRef.current.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  if (!open) return null;

  const variantStyles = {
    danger: {
      icon: (
        <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
      bg: 'bg-red-100',
      button: 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
    },
    warning: {
      icon: (
        <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
      bg: 'bg-amber-100',
      button: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500'
    },
    info: {
      icon: (
        <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      bg: 'bg-blue-100',
      button: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'
    }
  };

  const style = variantStyles[variant];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full" role="dialog" aria-modal="true">
        <div className="p-6">
          {/* Icon */}
          <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${style.bg}`}>
            {style.icon}
          </div>

          {/* Title */}
          <div className="mt-4 text-center">
            <h3 className="text-lg font-semibold text-gray-900">
              {title}
            </h3>
            {message && (
              <p className="mt-2 text-sm text-gray-600">
                {message}
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="bg-gray-50 px-6 py-4 flex gap-3 justify-end rounded-b-lg">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cancelText}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 text-sm font-medium text-white rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2 ${style.button}`}
          >
            {loading && (
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
