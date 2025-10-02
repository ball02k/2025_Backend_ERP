import React from "react";
import FieldError from "./FieldError.jsx";

export default function Input({ id, label, type = "text", value, onChange, error, required, hint, ...rest }) {
  const errId = `${id}-error`;
  return (
    <label htmlFor={id} className="flex flex-col gap-1">
      <span className="text-sm text-gray-700">
        {label}{required && <span aria-hidden="true" className="text-red-600"> *</span>}
      </span>
      <input
        id={id}
        type={type}
        value={value ?? ""}
        onChange={onChange}
        aria-invalid={!!error}
        aria-describedby={error ? errId : (hint ? `${id}-hint` : undefined)}
        className={`rounded-md border px-3 py-2 text-sm ${error ? "border-red-600 focus:ring-red-600" : ""}`}
        {...rest}
      />
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-gray-500">{hint}</p>}
      <FieldError id={errId} message={error} />
    </label>
  );
}

