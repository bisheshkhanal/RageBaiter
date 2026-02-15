import React, { useState } from "react";
import "../styles.css";

export type InterventionLevel = "low" | "medium" | "high";

export interface InterventionPopupProps {
  level: InterventionLevel;
  reason: string;
  onDismiss: () => void;
  onProceed: () => void;
  onAgree: () => void;
  onDisagree: () => void;
}

export const InterventionPopup: React.FC<InterventionPopupProps> = ({
  level,
  reason,
  onDismiss,
  onProceed,
  onAgree,
  onDisagree,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [feedbackState, setFeedbackState] = useState<"idle" | "agreed" | "disagreed">("idle");

  const analysisText =
    reason && reason !== "DEMO_PREVIEW"
      ? reason
      : "This post uses emotionally loaded framing that can narrow your perspective.";

  const counterArgument = (() => {
    if (analysisText.toLowerCase().includes("fallacies")) {
      return "A stronger view checks concrete evidence on both sides before accepting a one-sided claim.";
    }

    return "Consider what credible evidence could support the opposite interpretation of this claim.";
  })();

  const userQuestion =
    "What specific evidence would change your mind, and what is the strongest argument from the other side?";

  const getBorderColor = () => {
    switch (level) {
      case "high":
        return "border-red-500";
      case "medium":
        return "border-orange-500";
      case "low":
        return "border-yellow-500";
      default:
        return "border-gray-500";
    }
  };

  const getBgColor = () => {
    switch (level) {
      case "high":
        return "bg-red-50";
      case "medium":
        return "bg-orange-50";
      case "low":
        return "bg-yellow-50";
      default:
        return "bg-gray-50";
    }
  };

  const getIcon = () => {
    switch (level) {
      case "high":
        return "🛑";
      case "medium":
        return "⚠️";
      case "low":
        return "✋";
      default:
        return "ℹ️";
    }
  };

  return (
    <div
      className={`font-sans rounded-lg shadow-lg p-4 mb-4 border-l-4 ${getBorderColor()} ${getBgColor()} text-gray-800 transition-all duration-300 ease-in-out`}
      data-testid="intervention-popup"
      role="alert"
    >
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-2">
          <span className="text-2xl" role="img" aria-label="alert icon">
            {getIcon()}
          </span>
          <div>
            <h3 className="font-bold text-lg">Potential Rage Bait Detected</h3>
            <p className="text-sm text-gray-600">
              This content may be designed to provoke an emotional response.
            </p>
          </div>
        </div>
        <button
          onClick={onDismiss}
          className="text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Dismiss intervention"
        >
          ✕
        </button>
      </div>

      <div className="mt-3">
        <p className="font-medium">Analysis:</p>
        <p className="text-sm mb-2">{analysisText}</p>
        <p className="font-medium">Counterargument:</p>
        <p className="text-sm mb-2">{counterArgument}</p>
        <p className="text-xs text-gray-600 mb-2">Agree/Disagree updates your political vector.</p>
        <div className="flex items-center gap-2 mt-2 mb-2">
          <button
            onClick={() => {
              onAgree();
              setFeedbackState("agreed");
            }}
            className="text-xs bg-emerald-100 border border-emerald-300 text-emerald-800 px-3 py-1 rounded hover:bg-emerald-200 transition-colors"
            data-testid="feedback-agree-button"
          >
            Agree
          </button>
          <button
            onClick={() => {
              onDisagree();
              setFeedbackState("disagreed");
            }}
            className="text-xs bg-rose-100 border border-rose-300 text-rose-800 px-3 py-1 rounded hover:bg-rose-200 transition-colors"
            data-testid="feedback-dismiss-button"
          >
            Disagree
          </button>
        </div>

        {feedbackState !== "idle" ? (
          <p className="text-xs text-emerald-700 mb-2">
            Thanks. Your political vector has been updated.
          </p>
        ) : null}

        {isExpanded ? (
          <div className="mt-2 animate-fade-in">
            <p className="font-medium text-sm mt-2">User Question:</p>
            <p className="text-sm mb-3">{userQuestion}</p>
            <button
              onClick={onProceed}
              className="text-xs bg-white border border-gray-300 px-3 py-1 rounded hover:bg-gray-100 transition-colors mr-2"
            >
              View Content Anyway
            </button>
            <button
              onClick={() => setIsExpanded(false)}
              className="text-xs text-blue-600 hover:underline"
            >
              Show Less
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsExpanded(true)}
            className="text-sm text-blue-600 font-medium hover:underline mt-1"
          >
            Read More & Reflect
          </button>
        )}
      </div>
    </div>
  );
};
