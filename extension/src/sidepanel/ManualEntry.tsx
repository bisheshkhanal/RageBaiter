import { useState } from "react";

import "./ManualEntry.css";

export type ManualEntryProps = {
  onSubmit: (vector: { social: number; economic: number; populist: number }) => void;
  onCancel: () => void;
};

const clamp = (value: number): number => Math.max(-1, Math.min(1, value));

function parseInputValue(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = parseFloat(trimmed);
  if (Number.isNaN(parsed)) return null;
  return clamp(parsed);
}

export function ManualEntry({ onSubmit, onCancel }: ManualEntryProps): React.ReactElement {
  const [social, setSocial] = useState("");
  const [economic, setEconomic] = useState("");
  const [populist, setPopulist] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  const handleSubmit = () => {
    const errors: string[] = [];

    const socialValue = parseInputValue(social);
    if (socialValue === null) {
      errors.push("Social value must be a number between -1 and 1");
    }

    const economicValue = parseInputValue(economic);
    if (economicValue === null) {
      errors.push("Economic value must be a number between -1 and 1");
    }

    const populistValue = parseInputValue(populist);
    if (populistValue === null) {
      errors.push("Populist value must be a number between -1 and 1");
    }

    if (errors.length > 0) {
      setErrors(errors);
      return;
    }

    onSubmit({
      social: socialValue!,
      economic: economicValue!,
      populist: populistValue!,
    });
  };

  const handlePreset = (preset: "center" | "progressive" | "conservative" | "libertarian") => {
    switch (preset) {
      case "center":
        setSocial("0");
        setEconomic("0");
        setPopulist("0");
        break;
      case "progressive":
        setSocial("0.6");
        setEconomic("0.3");
        setPopulist("0.2");
        break;
      case "conservative":
        setSocial("-0.6");
        setEconomic("-0.3");
        setPopulist("0.1");
        break;
      case "libertarian":
        setSocial("0.2");
        setEconomic("-0.7");
        setPopulist("-0.2");
        break;
    }
    setErrors([]);
  };

  return (
    <div className="manual-entry">
      <div className="manual-entry-header">
        <h2 className="manual-entry-title">Manual Vector Entry</h2>
        <p className="manual-entry-subtitle">
          Enter values between -1 and 1 for each axis, or choose a preset.
        </p>
      </div>

      <div className="manual-entry-presets">
        <button
          type="button"
          className="preset-button"
          onClick={() => handlePreset("center")}
          data-testid="preset-center"
        >
          Center
        </button>
        <button
          type="button"
          className="preset-button"
          onClick={() => handlePreset("progressive")}
          data-testid="preset-progressive"
        >
          Progressive
        </button>
        <button
          type="button"
          className="preset-button"
          onClick={() => handlePreset("conservative")}
          data-testid="preset-conservative"
        >
          Conservative
        </button>
        <button
          type="button"
          className="preset-button"
          onClick={() => handlePreset("libertarian")}
          data-testid="preset-libertarian"
        >
          Libertarian
        </button>
      </div>

      <div className="manual-entry-fields">
        <div className="manual-field">
          <label htmlFor="manual-social">Social (-1 = Traditional, +1 = Progressive)</label>
          <input
            id="manual-social"
            type="number"
            step="0.1"
            min="-1"
            max="1"
            value={social}
            onChange={(e) => setSocial(e.target.value)}
            placeholder="0.0"
            data-testid="manual-social-input"
          />
        </div>

        <div className="manual-field">
          <label htmlFor="manual-economic">Economic (-1 = Free Market, +1 = Interventionist)</label>
          <input
            id="manual-economic"
            type="number"
            step="0.1"
            min="-1"
            max="1"
            value={economic}
            onChange={(e) => setEconomic(e.target.value)}
            placeholder="0.0"
            data-testid="manual-economic-input"
          />
        </div>

        <div className="manual-field">
          <label htmlFor="manual-populist">
            Populist (-1 = Pro-Establishment, +1 = Anti-Elite)
          </label>
          <input
            id="manual-populist"
            type="number"
            step="0.1"
            min="-1"
            max="1"
            value={populist}
            onChange={(e) => setPopulist(e.target.value)}
            placeholder="0.0"
            data-testid="manual-populist-input"
          />
        </div>
      </div>

      {errors.length > 0 && (
        <div className="manual-entry-errors" data-testid="manual-entry-errors">
          {errors.map((error, index) => (
            <div key={index} className="manual-entry-error">
              {error}
            </div>
          ))}
        </div>
      )}

      <div className="manual-entry-actions">
        <button
          type="button"
          className="manual-entry-button primary"
          onClick={handleSubmit}
          data-testid="manual-submit-button"
        >
          Save Vector
        </button>
        <button
          type="button"
          className="manual-entry-button secondary"
          onClick={onCancel}
          data-testid="manual-cancel-button"
        >
          Back to Quiz
        </button>
      </div>
    </div>
  );
}
