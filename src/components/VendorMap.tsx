import { useEffect } from "react";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default marker icons (bundlers strip the relative paths Leaflet expects)
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

import type { MapVendor } from "./map-types";

export default function VendorMap({ vendors }: { vendors: MapVendor[] }) {
  useEffect(() => {
    L.Marker.prototype.options.icon = defaultIcon;
  }, []);
  const points = vendors.filter((v) => v.lat != null && v.lng != null);
  const center: [number, number] = points.length
    ? [points[0].lat!, points[0].lng!]
    : [52.3702, 4.8952];

  return (
    <MapContainer center={center} zoom={14} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {points.map((v) => (
        <Marker key={v.id} position={[v.lat!, v.lng!]} icon={defaultIcon}>
          <Popup>
            <div className="min-w-[140px]">
              <div className="font-bold" style={{ color: v.brand_primary ?? undefined }}>{v.name}</div>
              <div className="text-xs text-neutral-500">{v.cuisine}</div>
              <a href={`/${v.slug}`} className="mt-1 inline-block text-xs font-semibold underline">
                Open →
              </a>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
