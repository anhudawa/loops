"use client";

import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="min-h-screen flex items-center justify-center px-6"
          style={{ background: "var(--bg)" }}
        >
          <div className="text-center max-w-md">
            <div
              className="w-16 h-16 mx-auto mb-6 rounded-2xl flex items-center justify-center"
              style={{ background: "rgba(255, 51, 85, 0.1)" }}
            >
              <svg
                className="w-8 h-8"
                fill="none"
                viewBox="0 0 24 24"
                stroke="var(--danger)"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
            <h1
              className="text-xl font-bold mb-2"
              style={{ color: "var(--text)" }}
            >
              Something went wrong
            </h1>
            <p
              className="text-sm mb-6"
              style={{ color: "var(--text-muted)" }}
            >
              An unexpected error occurred. Try refreshing the page or click
              below to retry.
            </p>
            <button
              onClick={this.handleRetry}
              className="px-6 py-3 rounded-xl font-bold text-sm uppercase tracking-wider transition-all hover:brightness-110"
              style={{
                background: "var(--accent)",
                color: "var(--bg)",
              }}
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
