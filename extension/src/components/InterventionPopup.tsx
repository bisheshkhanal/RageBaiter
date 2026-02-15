import React, { useState } from "react";
import "../styles.css";

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

  const accentColor = (() => {
    switch (level) {
      case "high":
        return "#ef4444";
      case "medium":
        return "#f59e0b";
      case "low":
        return "#f59e0b";
      default:
        return "#6b7280";
    }
  })();

  const sectionLabel: React.CSSProperties = {
    fontSize: "11px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.8px",
    marginBottom: "4px",
  };

  const bodyText: React.CSSProperties = {
    fontSize: "13px",
    color: "#94a3b8",
    lineHeight: "1.55",
  };

  return (
    <div
      style={{
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        background: "#1a1a2e",
        borderRadius: "12px",
        border: `1px solid ${accentColor}40`,
        boxShadow: `0 4px 24px rgba(0,0,0,0.5), 0 0 0 1px ${accentColor}20`,
        color: "#e2e8f0",
        marginBottom: "12px",
        overflow: "hidden",
        fontSize: "14px",
        lineHeight: "1.5",
      }}
      data-testid="intervention-popup"
      role="alert"
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 16px 10px",
          borderBottom: `1px solid ${accentColor}30`,
          background: `linear-gradient(135deg, ${accentColor}15, transparent)`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "20px" }} role="img" aria-label="warning">
            {"\u26A0\uFE0F"}
          </span>
          <div>
            <div
              style={{
                ...sectionLabel,
                color: accentColor,
                letterSpacing: "1.2px",
                marginBottom: "2px",
              }}
            >
              Logic Failure: {logicFailure}
            </div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "#94a3b8" }}>
              RageBaiter Analysis
            </div>
          </div>
        </div>
        <button
          onClick={onDismiss}
          style={{
            background: "none",
            border: "none",
            color: "#64748b",
            cursor: "pointer",
            fontSize: "18px",
            padding: "4px",
            lineHeight: 1,
          }}
          aria-label="Dismiss"
        >
          {"\u2715"}
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: "14px 16px" }}>
        {/* The Claim */}
        <div style={{ marginBottom: "14px" }}>
          <div style={{ ...sectionLabel, color: accentColor }}>The Claim</div>
          <div
            style={{
              ...bodyText,
              fontStyle: "italic",
              color: "#cbd5e1",
              borderLeft: `3px solid ${accentColor}60`,
              paddingLeft: "10px",
            }}
          >
            {"\u201C"}
            {claimText}
            {"\u201D"}
          </div>
        </div>

        {/* The Mechanism */}
        <div style={{ marginBottom: "14px" }}>
          <div style={{ ...sectionLabel, color: "#60a5fa" }}>The Mechanism</div>
          <div style={bodyText}>{mechanismText}</div>
        </div>

        {/* The Data Check */}
        <div style={{ marginBottom: "14px" }}>
          <div style={{ ...sectionLabel, color: "#34d399" }}>The Data Check</div>
          <div style={bodyText}>{dataCheckText}</div>
        </div>

        {/* Socratic Challenge */}
        <div
          style={{
            marginBottom: "16px",
            background: "#0f172a",
            borderRadius: "8px",
            padding: "10px 12px",
            border: "1px solid #334155",
          }}
        >
          <div style={{ ...sectionLabel, color: "#a78bfa" }}>Socratic Challenge</div>
          <div style={{ ...bodyText, fontStyle: "italic", color: "#e2e8f0" }}>
            {"\u201C"}
            {socraticText}
            {"\u201D"}
          </div>
        </div>

        {/* Impact / Feedback */}
        <div style={{ borderTop: "1px solid #334155", paddingTop: "12px" }}>
          <div style={{ ...sectionLabel, color: "#64748b", marginBottom: "8px" }}>Impact</div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              onClick={() => {
                if (feedbackState !== "idle") return;
                onAgree();
                setFeedbackState("agreed");
              }}
              disabled={feedbackState !== "idle"}
              style={{
                fontSize: "12px",
                fontWeight: 600,
                padding: "6px 16px",
                borderRadius: "6px",
                border: "1px solid #065f46",
                background: feedbackState === "agreed" ? "#065f46" : "#064e3b",
                color: "#6ee7b7",
                cursor: feedbackState !== "idle" ? "not-allowed" : "pointer",
                opacity: feedbackState !== "idle" && feedbackState !== "agreed" ? 0.4 : 1,
                transition: "all 0.15s",
              }}
              data-testid="feedback-agree-button"
            >
              {feedbackState === "agreed" ? "Agreed \u2713" : "Agree"}
            </button>
            <button
              onClick={() => {
                if (feedbackState !== "idle") return;
                onDisagree();
                setFeedbackState("disagreed");
              }}
              disabled={feedbackState !== "idle"}
              style={{
                fontSize: "12px",
                fontWeight: 600,
                padding: "6px 16px",
                borderRadius: "6px",
                border: "1px solid #991b1b",
                background: feedbackState === "disagreed" ? "#991b1b" : "#7f1d1d",
                color: "#fca5a5",
                cursor: feedbackState !== "idle" ? "not-allowed" : "pointer",
                opacity: feedbackState !== "idle" && feedbackState !== "disagreed" ? 0.4 : 1,
                transition: "all 0.15s",
              }}
              data-testid="feedback-dismiss-button"
            >
              {feedbackState === "disagreed" ? "Disagreed \u2713" : "Disagree"}
            </button>
            <button
              onClick={onProceed}
              style={{
                fontSize: "12px",
                fontWeight: 500,
                padding: "6px 12px",
                borderRadius: "6px",
                border: "1px solid #334155",
                background: "transparent",
                color: "#64748b",
                cursor: "pointer",
                marginLeft: "auto",
                transition: "all 0.15s",
              }}
            >
              Dismiss
            </button>
          </div>
          {feedbackState !== "idle" ? (
            <div style={{ fontSize: "11px", color: "#34d399", marginTop: "8px" }}>
              Your political vector has been updated.
            </div>
          ) : (
            <div style={{ fontSize: "11px", color: "#475569", marginTop: "8px" }}>
              Agree/Disagree updates your political compass vector.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
