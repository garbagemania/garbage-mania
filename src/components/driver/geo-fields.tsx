"use client";

import { useEffect, useState } from "react";

/**
 * Captures the device position once and submits it as hidden fields.
 * GPS is best-effort: when unavailable or denied the fields stay empty and
 * the collection can still be recorded (the photo is the mandatory proof).
 */
export function GeoFields() {
  const [pos, setPos] = useState<{ lat: string; lng: string } | null>(null);

  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setPos({ lat: String(p.coords.latitude), lng: String(p.coords.longitude) }),
      () => setPos(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  }, []);

  return (
    <>
      <input type="hidden" name="latitude" value={pos?.lat ?? ""} />
      <input type="hidden" name="longitude" value={pos?.lng ?? ""} />
      <span className="text-xs text-neutral-500">{pos ? "GPS captured" : "GPS not available"}</span>
    </>
  );
}
