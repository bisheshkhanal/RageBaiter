import "./QuizResults.css";

export type QuizResultsProps = {
  social: number;
  economic: number;
  populist: number;
  onRetake: () => void;
  onContinue: () => void;
};

function getAxisLabel(value: number): string {
  if (value > 0.5) return "Strongly Progressive";
  if (value > 0.2) return "Progressive";
  if (value > -0.2) return "Moderate";
  if (value > -0.5) return "Traditional";
  return "Strongly Traditional";
}

function getEconomicLabel(value: number): string {
  if (value > 0.5) return "Strongly Interventionist";
  if (value > 0.2) return "Interventionist";
  if (value > -0.2) return "Centrist";
  if (value > -0.5) return "Free Market";
  return "Strongly Free Market";
}

function getPopulistLabel(value: number): string {
  if (value > 0.5) return "Strongly Anti-Elite";
  if (value > 0.2) return "Anti-Elite";
  if (value > -0.2) return "Balanced";
  if (value > -0.5) return "Pro-Establishment";
  return "Strongly Pro-Establishment";
}

export function QuizResults({
  social,
  economic,
  populist,
  onRetake,
  onContinue,
}: QuizResultsProps): React.ReactElement {
  return (
    <div className="quiz-results">
      <div className="quiz-results-header">
        <h2 className="quiz-results-title">Quiz Complete!</h2>
        <p className="quiz-results-subtitle">Your Political Compass Position</p>
      </div>

      <div className="vector-display">
        <div className="vector-axis">
          <div className="vector-axis-header">
            <span className="vector-axis-name">Social</span>
            <span className="vector-axis-value" data-testid="result-social-value">
              {social.toFixed(2)}
            </span>
          </div>
          <div className="vector-bar-container">
            <div className="vector-bar">
              <div
                className="vector-bar-fill"
                style={{
                  left: social < 0 ? `${50 + social * 50}%` : "50%",
                  width: `${Math.abs(social) * 50}%`,
                }}
                data-testid="result-social-bar"
              />
            </div>
          </div>
          <span className="vector-axis-label" data-testid="result-social-label">
            {getAxisLabel(social)}
          </span>
        </div>

        <div className="vector-axis">
          <div className="vector-axis-header">
            <span className="vector-axis-name">Economic</span>
            <span className="vector-axis-value" data-testid="result-economic-value">
              {economic.toFixed(2)}
            </span>
          </div>
          <div className="vector-bar-container">
            <div className="vector-bar">
              <div
                className="vector-bar-fill economic"
                style={{
                  left: economic < 0 ? `${50 + economic * 50}%` : "50%",
                  width: `${Math.abs(economic) * 50}%`,
                }}
                data-testid="result-economic-bar"
              />
            </div>
          </div>
          <span className="vector-axis-label" data-testid="result-economic-label">
            {getEconomicLabel(economic)}
          </span>
        </div>

        <div className="vector-axis">
          <div className="vector-axis-header">
            <span className="vector-axis-name">Populist</span>
            <span className="vector-axis-value" data-testid="result-populist-value">
              {populist.toFixed(2)}
            </span>
          </div>
          <div className="vector-bar-container">
            <div className="vector-bar">
              <div
                className="vector-bar-fill populist"
                style={{
                  left: populist < 0 ? `${50 + populist * 50}%` : "50%",
                  width: `${Math.abs(populist) * 50}%`,
                }}
                data-testid="result-populist-bar"
              />
            </div>
          </div>
          <span className="vector-axis-label" data-testid="result-populist-label">
            {getPopulistLabel(populist)}
          </span>
        </div>
      </div>

      <div className="quiz-results-actions">
        <button
          type="button"
          className="quiz-result-button primary"
          onClick={onContinue}
          data-testid="results-continue-button"
        >
          Continue to Extension
        </button>
        <button
          type="button"
          className="quiz-result-button secondary"
          onClick={onRetake}
          data-testid="results-retake-button"
        >
          Retake Quiz
        </button>
      </div>
    </div>
  );
}
