import React from "react";
import { createRoot } from "react-dom/client";
import ComplaintForm from "./src/ComplaintForm.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ComplaintForm />
  </React.StrictMode>,
);
