import React from "react";
import ReactDOM from "react-dom/client";

import { env } from "./config/env";
import { App } from "./App";

// Demo mode swaps the entire HTTP layer for in-memory fixtures. Must
// run *before* React mounts so the very first list-page request goes
// through the demo adapter, not the real network. Dynamic import keeps
// the demo bundle out of production builds when the flag is off.
async function bootstrap() {
  if (env.demoMode) {
    const { installDemoMode } = await import("./demo/installDemo");
    installDemoMode();
  }
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void bootstrap();
