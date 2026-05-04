import { useMemo } from "react";
import { CircleMarker, MapContainer, TileLayer, useMapEvents } from "react-leaflet";

type MapPickerProps = {
  latitude: number | null;
  longitude: number | null;
  onChange: (latitude: number, longitude: number) => void;
};

const defaultCenter: [number, number] = [35.681236, 139.767125];

export function MapPicker({ latitude, longitude, onChange }: MapPickerProps) {
  const center = useMemo<[number, number]>(() => {
    if (latitude !== null && longitude !== null) return [latitude, longitude];
    return defaultCenter;
  }, [latitude, longitude]);

  return (
    <div className="shop-map overflow-hidden rounded border border-black/10">
      <MapContainer center={center} zoom={15} scrollWheelZoom={true} className="h-64 w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickHandler onChange={onChange} />
        {latitude !== null && longitude !== null && (
          <CircleMarker center={[latitude, longitude]} radius={9} pathOptions={{ color: "#107c72", fillColor: "#107c72", fillOpacity: 0.9 }} />
        )}
      </MapContainer>
    </div>
  );
}

function ClickHandler({ onChange }: { onChange: (latitude: number, longitude: number) => void }) {
  useMapEvents({
    click(event) {
      onChange(roundCoord(event.latlng.lat), roundCoord(event.latlng.lng));
    },
  });
  return null;
}

function roundCoord(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
