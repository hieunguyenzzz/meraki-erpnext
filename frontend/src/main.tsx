import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { FrappeProvider } from "frappe-react-sdk";
import { UserProvider } from "@/contexts/UserContext";
import App from "@/App";
import "@/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <FrappeProvider
        siteName="erp.merakiwp.com"
        url=""
      >
        <UserProvider>
          <App />
        </UserProvider>
      </FrappeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
