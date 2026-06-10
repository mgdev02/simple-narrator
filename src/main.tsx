import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initSyncWasm } from "@/lib/syncWasm";
import "./index.css";

void initSyncWasm();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
