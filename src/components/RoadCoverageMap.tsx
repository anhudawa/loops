"use client";

import { Fragment, useMemo } from "react";
import L from "leaflet";
import { Circle, CircleMarker, MapContainer, Polyline, Popup, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { MAP_ATTRIBUTION, MAP_TILE_URL } from "@/config/map-provider";

export type AdminRoadCoverageState =
  | "current_assessed"
  | "current_unassessed"
  | "known_safety_warning"
  | "stale"
  | "invalid";

export interface AdminRoadCoverageEdge {
  id: string;
  coordinates: [number, number][];
  length_km: number;
  state: AdminRoadCoverageState;
  observed_at: string;
  lower_stress_score: number | null;
  flow_score: number | null;
  scenic_score: number | null;
  assessment: {
    surface: string;
    traffic: string;
    sightlines: string;
    flow: string;
  } | null;
}

const STATE_STYLE: Record<AdminRoadCoverageState, { color: string; label: string }> = {
  current_assessed: { color: "#c8ff00", label: "Current + assessed" },
  current_unassessed: { color: "#38bdf8", label: "Current, needs assessment" },
  known_safety_warning: { color: "#ff4d4f", label: "Known safety warning" },
  stale: { color: "#8b8b96", label: "Stale evidence" },
  invalid: { color: "#f59e0b", label: "Invalid evidence" },
};

export const ROAD_COVERAGE_LEGEND = STATE_STYLE;

export default function RoadCoverageMap({
  center,
  radiusKm,
  edges,
}: {
  center: [number, number];
  radiusKm: number;
  edges: AdminRoadCoverageEdge[];
}) {
  const bounds = useMemo(() => {
    const coordinates = edges.flatMap((edge) => edge.coordinates);
    if (coordinates.length > 0) return L.latLngBounds(coordinates);
    return L.latLng(center).toBounds(radiusKm * 2_000);
  }, [center, edges, radiusKm]);

  return (
    <div className="h-[420px] w-full">
      <MapContainer bounds={bounds} boundsOptions={{ padding: [24, 24] }} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
        {MAP_TILE_URL && <TileLayer attribution={MAP_ATTRIBUTION} url={MAP_TILE_URL} />}
        <Circle
          center={center}
          radius={radiusKm * 1_000}
          pathOptions={{ color: "#c8ff00", weight: 1, opacity: 0.45, fillOpacity: 0.025, dashArray: "6 8" }}
        />
        <CircleMarker
          center={center}
          radius={7}
          pathOptions={{ color: "#0a0a0c", weight: 3, fillColor: "#c8ff00", fillOpacity: 1 }}
        >
          <Popup>Public Clontarf planning origin</Popup>
        </CircleMarker>
        {edges.map((edge) => {
          const style = STATE_STYLE[edge.state];
          const endpoint = edge.coordinates.at(-1)!;
          return (
            <Fragment key={edge.id}>
              <Polyline
                positions={edge.coordinates}
                pathOptions={{ color: style.color, weight: 4, opacity: edge.state === "stale" ? 0.45 : 0.9 }}
              >
                <Popup>
                  <strong>{style.label}</strong><br />
                  {edge.length_km} km · observed {edge.observed_at}<br />
                  Flow {edge.flow_score ?? "unscored"} · stress {edge.lower_stress_score ?? "unscored"} · scenic {edge.scenic_score ?? "unscored"}
                  {edge.assessment && <><br />Human review: {edge.assessment.traffic} traffic · {edge.assessment.surface} surface · {edge.assessment.flow} flow</>}
                </Popup>
              </Polyline>
              <CircleMarker
                center={endpoint}
                radius={2.5}
                interactive={false}
                pathOptions={{ color: style.color, fillColor: style.color, fillOpacity: 1, weight: 1 }}
              />
            </Fragment>
          );
        })}
      </MapContainer>
    </div>
  );
}
