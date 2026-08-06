import { createRoot } from "react-dom/client";

import { App } from "./app.js";

const rootElement = document.getElementById("root");
if (rootElement === null) {
  throw new Error("M0_015_VIEWER_ROOT_MISSING");
}

createRoot(rootElement).render(<App />);
