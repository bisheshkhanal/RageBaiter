import React, { useState } from "react";

export type InterventionLevel = "low" | "medium" | "high";

export interface InterventionPopupProps {
  level: InterventionLevel;
  reason: string;
  counterArgument?: string | undefined;
  logicFailure?: string | undefined;
  claim?: string | undefined;
  mechanism?: string | undefined;
  dataCheck?: string | undefined;
  socraticChallenge?: string | undefined;
  onDismiss: () => void;
  onProceed: () => void;
  onAgree: () => void;
  onDisagree: () => void;
}

export const InterventionPopup: React.FC<InterventionPopupProps> = ({
  level,
  reason,
  counterArgument: counterArgumentProp,
  logicFailure: logicFailureProp,
  claim: claimProp,
  mechanism: mechanismProp,
  dataCheck: dataCheckProp,
  socraticChallenge: socraticChallengeProp,
  onDismiss,
  onProceed,
  onAgree,
  onDisagree,
}) => {
  const [feedbackState, setFeedbackState] = useState<"idle" | "agreed" | "disagreed">("idle");

  const logicFailure =
    logicFailureProp && logicFailureProp.length > 0 ? logicFailureProp : "Manipulative Framing";

  const claimText =
    claimProp && claimProp.length > 0
      ? claimProp
      : reason && reason !== "DEMO_PREVIEW"
        ? reason
        : "This post makes a claim designed to provoke an emotional response.";

  const mechanismText =
    mechanismProp && mechanismProp.length > 0
      ? mechanismProp
      : "This post uses emotionally loaded framing that can narrow your perspective.";

  const dataCheckText =
    dataCheckProp && dataCheckProp.length > 0
      ? dataCheckProp
      : counterArgumentProp && counterArgumentProp.length > 0
        ? counterArgumentProp
        : "Consider what credible evidence could support the opposite interpretation of this claim.";

  const socraticText =
    socraticChallengeProp && socraticChallengeProp.length > 0
      ? socraticChallengeProp
      : "What specific evidence would change your mind, and what is the strongest argument from the other side?";

  const handleAgree = () => {
    if (feedbackState !== "idle") return;
    onAgree();
    setFeedbackState("agreed");
  };

  const handleDisagree = () => {
    if (feedbackState !== "idle") return;
    onDisagree();
    setFeedbackState("disagreed");
  };

  const agreeButtonClass =
    `rb-agree-btn ${feedbackState === "agreed" ? "rb-active" : ""} ${feedbackState !== "idle" && feedbackState !== "agreed" ? "rb-inactive" : ""}`.trim();

  const disagreeButtonClass =
    `rb-disagree-btn ${feedbackState === "disagreed" ? "rb-active" : ""} ${feedbackState !== "idle" && feedbackState !== "disagreed" ? "rb-inactive" : ""}`.trim();

  return (
    <div className="rb-popup" data-testid="intervention-popup" role="alert" data-level={level}>
      <div className="rb-header">
        <div className="rb-header-left">
          <span className="rb-warning-icon" role="img" aria-label="warning">
            {"\u26A0\uFE0F"}
          </span>
          <div className="rb-header-text">
            <div className="rb-section-label rb-header-label">Logic Failure: {logicFailure}</div>
            <div className="rb-header-subtitle">RageBaiter Analysis</div>
          </div>
        </div>
        <button onClick={onDismiss} className="rb-dismiss-btn" aria-label="Dismiss">
          {"\u2715"}
        </button>
      </div>

      <div className="rb-body">
        <div className="rb-claim-section">
          <div className="rb-section-label rb-claim-label">The Claim</div>
          <div className="rb-claim-text">
            {"\u201C"}
            {claimText}
            {"\u201D"}
          </div>
        </div>

        <div className="rb-mechanism-section">
          <div className="rb-section-label rb-mechanism-label">The Mechanism</div>
          <div className="rb-body-text">{mechanismText}</div>
        </div>

        <div className="rb-datacheck-section">
          <div className="rb-section-label rb-datacheck-label">The Data Check</div>
          <div className="rb-body-text">{dataCheckText}</div>
        </div>

        <div className="rb-socratic-section">
          <div className="rb-section-label rb-socratic-label">Socratic Challenge</div>
          <div className="rb-socratic-text">
            {"\u201C"}
            {socraticText}
            {"\u201D"}
          </div>
        </div>

        <div className="rb-impact-section">
          <div className="rb-section-label rb-impact-label">Impact</div>
          <div className="rb-button-row">
            <button
              onClick={handleAgree}
              disabled={feedbackState !== "idle"}
              className={agreeButtonClass}
              data-testid="feedback-agree-button"
            >
              {feedbackState === "agreed" ? "Agreed \u2713" : "Agree"}
            </button>
            <button
              onClick={handleDisagree}
              disabled={feedbackState !== "idle"}
              className={disagreeButtonClass}
              data-testid="feedback-dismiss-button"
            >
              {feedbackState === "disagreed" ? "Disagreed \u2713" : "Disagree"}
            </button>
            <button onClick={onProceed} className="rb-proceed-btn">
              Dismiss
            </button>
          </div>
          {feedbackState !== "idle" ? (
            <div className="rb-feedback-message rb-feedback-success">
              Your political vector has been updated.
            </div>
          ) : (
            <div className="rb-feedback-message rb-feedback-info">
              Agree/Disagree updates your political compass vector.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
