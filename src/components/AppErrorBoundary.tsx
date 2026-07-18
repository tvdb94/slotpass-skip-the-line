import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportLovableError } from "@/lib/lovable-error-reporting";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("AppErrorBoundary caught:", error, info);
    reportLovableError(error, { boundary: "app_error_boundary" });
  }

  private handleReload = () => {
    if (typeof window !== "undefined") window.location.reload();
  };

  private handleHome = () => {
    if (typeof window !== "undefined") window.location.assign("/");
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const isChunkError = /Loading chunk|Importing a module script failed|Failed to fetch dynamically imported module/i.test(
      error.message ?? ""
    );

    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {isChunkError ? "We couldn't load part of the app" : "Something went wrong"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isChunkError
              ? "A new version may have just been released. Refresh to get the latest."
              : "An unexpected error occurred. Try refreshing or head back home."}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button
              onClick={this.handleReload}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Refresh
            </button>
            <button
              onClick={this.handleHome}
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              Go home
            </button>
          </div>
        </div>
      </div>
    );
  }
}