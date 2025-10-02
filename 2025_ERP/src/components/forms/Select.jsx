import React from "react";
import FieldError from "./FieldError.jsx";

export default function Select({ id, label, value, onChange, options = [], error, required, hint, ...rest }) {
  const errId = `${id}-error`;
  return (
    <label htmlFor={id} className="flex flex-col gap-1">
      <span className="text-sm text-gray-700">
        {label}{required && <span aria-hidden="true" className="text-red-600"> *</span>}
      </span>
      <select
        id={id}
        value={value ?? ""}
        onChange={onChange}
        aria-invalid={!!error}
        aria-describedby={error ? errId : (hint ? `${id}-hint` : undefined)}
        className={`rounded-md border px-3 py-2 text-sm ${error ? "border-red-600 focus:ring-red-600" : ""}`}
        {...rest}
      >
        <option value="">Select…</option>
        {options.map((o) => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
      </select>
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-gray-500">{hint}</p>}
      <FieldError id={errId} message={error} />
    </label>
  );
}

