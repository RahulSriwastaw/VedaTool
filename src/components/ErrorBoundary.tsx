import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="min-h-screen bg-[#0F0F0F] flex items-center justify-center p-2 text-center">
            <div className="max-w-md">
              <h1 className="text-[20px] font-bold text-[#EFEFEF] mb-1">
                Something went wrong
              </h1>
              <p className="text-[#888888] mb-3">
                We apologized for the inconvenience. Please try refreshing the
                page.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="px-3 py-1.5 bg-[var(--accent)] text-white rounded-[6px] font-bold hover:bg-[var(--accent-hover)] transition-colors cursor-pointer text-[13px]"
              >
                Reload Application
              </button>
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
