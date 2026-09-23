import { Component, type ReactNode } from "react";

// Routes are code-split (React.lazy), and each deploy deletes the previous build's
// content-hashed chunk files (frontend/scripts/deploy-update.sh runs `rsync --delete`). A tab
// left open across a deploy that then navigates to a not-yet-loaded route tries to fetch a
// chunk file that no longer exists, which throws one of these messages depending on the
// browser. Without this boundary that crash unmounts the whole app -- a blank white page with
// no indication anything went wrong.
const CHUNK_ERROR_PATTERN =
  /dynamically imported module|importing a module script failed|chunkloaderror|loading chunk/i;

// Survives the reload (sessionStorage, not a JS variable) so a *second* chunk error right after
// the reload -- a genuinely broken deploy, not just a stale tab -- falls through to the manual
// fallback below instead of reload-looping forever.
const RELOAD_FLAG = "gnat_chunk_reload_attempted";

type Props = { children: ReactNode };
type State = { hasError: boolean };

export default class ChunkErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidMount() {
    // Reaching a clean mount means this page load didn't hit the error that set the flag, so
    // clear it -- a future deploy should still get one automatic reload attempt, not none.
    sessionStorage.removeItem(RELOAD_FLAG);
  }

  componentDidCatch(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (CHUNK_ERROR_PATTERN.test(message) && !sessionStorage.getItem(RELOAD_FLAG)) {
      sessionStorage.setItem(RELOAD_FLAG, "1");
      window.location.reload();
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "grid",
            placeItems: "center",
            minHeight: "100dvh",
            padding: 24,
            textAlign: "center",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <div>
            <h1 style={{ fontSize: 18, marginBottom: 8 }}>Something went wrong</h1>
            <p style={{ color: "#5b6472", marginBottom: 16 }}>
              This page couldn&apos;t load. Reloading usually fixes it.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                minHeight: 40,
                padding: "0 16px",
                borderRadius: 8,
                border: "none",
                background: "#1f9c7c",
                color: "#fff",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
