"use client";

import { useEffect } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Link from "next/link";

export type MapMarker = {
  id: string;
  lat: number;
  lng: number;
  title: string;
  subtitle?: string;
  href?: string;
};

// Diyarbakır city center — used as the default view when there are no markers yet.
const DIYARBAKIR_CENTER: [number, number] = [37.9144, 40.2306];

// A plain colored-pin divIcon avoids bundler headaches with Leaflet's
// default marker image assets (their relative URLs break under webpack).
const pinIcon = L.divIcon({
  className: "",
  html: `<svg width="28" height="38" viewBox="0 0 28 38" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 0C6.3 0 0 6.3 0 14c0 10.5 14 24 14 24s14-13.5 14-24C28 6.3 21.7 0 14 0z" fill="#0f6e78"/>
    <circle cx="14" cy="14" r="5.5" fill="white"/>
  </svg>`,
  iconSize: [28, 38],
  iconAnchor: [14, 38],
  popupAnchor: [0, -34],
});

/** Fits the map view to all markers whenever the marker set changes. */
function FitBounds({ markers }: { markers: MapMarker[] }) {
  const map = useMap();

  useEffect(() => {
    if (markers.length === 0) return;
    if (markers.length === 1) {
      map.setView([markers[0].lat, markers[0].lng], 15);
      return;
    }
    const bounds = L.latLngBounds(markers.map((m) => [m.lat, m.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [32, 32] });
  }, [markers, map]);

  return null;
}

export default function EventMapInner({
  markers,
  className,
}: {
  markers: MapMarker[];
  className?: string;
}) {
  return (
    <MapContainer
      center={DIYARBAKIR_CENTER}
      zoom={13}
      scrollWheelZoom={false}
      className={className ?? "h-96 w-full"}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> katkıda bulunanlar'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds markers={markers} />
      {markers.map((marker) => (
        <Marker key={marker.id} position={[marker.lat, marker.lng]} icon={pinIcon}>
          <Popup>
            <div className="flex flex-col gap-0.5">
              {marker.href ? (
                <Link href={marker.href} className="font-medium text-dicle hover:underline">
                  {marker.title}
                </Link>
              ) : (
                <span className="font-medium">{marker.title}</span>
              )}
              {marker.subtitle && (
                <span className="text-xs text-zinc-600">{marker.subtitle}</span>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
