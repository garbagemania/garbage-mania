"use client";

import { useEffect } from "react";

/** Registers the offline/installable service worker (production only, so dev hot-reload isn't affected). */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* installability is a nicety; never break the app over it */
    });
  }, []);
  return null;
}
