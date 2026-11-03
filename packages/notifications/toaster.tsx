"use client";

import { Toaster as SonnerToaster } from "sonner";
import "./notifications.css";

export function Toaster() {
  return (
    <SonnerToaster
      className="crm-toaster"
      theme="dark"
      position="bottom-right"
      closeButton
      duration={5000}
    />
  );
}
