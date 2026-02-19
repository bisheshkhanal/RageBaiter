import React from "react";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("[RageBaiter] ErrorBoundary caught an error:", error);
    console.error("[RageBaiter] Error info:", info);
  }

  override render(): React.ReactNode {
    if (this.state.hasError) {
      return this.props.fallback ?? <DefaultFallback />;
    }

    return this.props.children;
  }
}

function DefaultFallback(): React.ReactElement {
  return (
    <div style={{ padding: "1rem", color: "#f87171" }}>
      Something went wrong. <button onClick={() => window.location.reload()}>Reload</button>
    </div>
  );
}
