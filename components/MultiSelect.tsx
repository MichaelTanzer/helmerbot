"use client";
import * as React from 'react';

export function MultiSelect({
  options,
  value,
  onChange,
  label,
}: {
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  label: string;
}) {
  const toggle = (name: string) =>
    onChange(value.includes(name) ? value.filter(v => v !== name) : [...value, name]);

  const setAll = () => onChange(options.slice(0));
  const clearAll = () => onChange([]);

  return (
    <fieldset className="fieldset">
      <legend className="legend">{label}</legend>
      <div className="controls-inline">
        <button type="button" onClick={setAll} className="btn btn-ghost">Select all</button>
        <button type="button" onClick={clearAll} className="btn btn-ghost">Clear</button>
      </div>
      <div className="choices">
        {options.map(o => (
          <label key={o} className="choice">
            <input type="checkbox" checked={value.includes(o)} onChange={() => toggle(o)} />
            <span>{o}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
