"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    // Em desenvolvimento o service worker atrapalharia o hot reload.
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Sem service worker o app continua funcionando, só não instala/offline.
    });
  }, []);

  return null;
}
