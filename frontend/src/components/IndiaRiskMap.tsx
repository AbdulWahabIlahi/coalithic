import { useState, useEffect } from "react";
import { RefreshCw, X } from "lucide-react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { RISK_LABEL } from "@/lib/demo";
import { useFieldCaptures } from "@/lib/field";
import { RISK_COLORS, riskBand, type Mine } from "@/lib/types";
import { Button } from "@/components/ui/button";

// Fallback: stylized India outline used when Leaflet tiles can't load (offline demo).
const INDIA_OUTLINE: Array<[number, number]> = [
  [75.9, 35.3], [78.0, 35.5], [79.2, 34.5], [78.5, 33.5], [79.5, 32.8], [81.0, 30.3],
  [83.0, 29.5], [85.0, 28.3], [87.0, 28.0], [88.2, 27.9], [89.5, 28.3], [92.0, 28.5],
  [94.0, 28.6], [96.2, 29.4], [97.3, 28.4], [96.8, 27.5], [95.4, 26.8], [94.2, 25.6],
  [93.6, 24.4], [93.2, 23.0], [92.4, 21.9], [91.6, 22.9], [91.2, 24.2], [90.4, 25.2],
  [89.8, 25.9], [89.5, 25.0], [89.2, 24.0], [88.9, 22.6], [88.2, 21.9], [87.0, 21.1],
  [86.0, 20.4], [84.5, 19.6], [83.0, 18.4], [81.5, 16.6], [80.5, 15.4], [80.1, 13.5],
  [80.0, 12.0], [79.5, 10.3], [78.9, 9.5], [78.1, 8.9], [77.5, 8.1], [76.6, 8.9],
  [76.0, 10.3], [75.0, 12.5], [74.2, 14.5], [73.4, 16.2], [72.9, 18.5], [72.6, 20.5],
  [72.0, 21.2], [70.8, 20.7], [69.9, 21.9], [70.5, 22.9], [69.6, 22.9], [68.9, 23.7],
  [69.9, 24.4], [70.8, 25.7], [71.9, 27.0], [72.9, 28.0], [73.4, 29.4], [74.5, 31.0],
  [74.0, 32.0], [74.4, 33.3], [74.9, 34.3],
];
const VIEW_W = 400;
const VIEW_H = 440;
const LNG_MIN = 68;
const LNG_MAX = 98;
const LAT_MIN = 8;
const LAT_MAX = 38;
function project(lng: number, lat: number): [number, number] {
  return [
    ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * VIEW_W,
    ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * VIEW_H,
  ];
}
const POLYGON_POINTS = INDIA_OUTLINE.map(([lng, lat]) => project(lng, lat).join(",")).join(" ");
const LEGEND = ["low", "watch", "high"] as const;

// Small component to fit the map bounds to the markers when they change.
function FitBounds({ mines }: { mines: Mine[] }) {
  const map = useMap();
  useEffect(() => {
    if (mines.length > 0) {
      const group = new (window as any).L.featureGroup(
        mines.map((m) => new (window as any).L.circleMarker([m.lat, m.lng] as [number, number]))
      );
      map.fitBounds(group.getBounds().pad(0.15), { maxZoom: 8 });
    }
  }, [map, mines]);
  return null;
}

interface IndiaRiskMapProps {
  mines: Mine[];
  loading: boolean;
  error: boolean;
  onRefresh: () => void;
}

// LIVE GEO-INTELLIGENCE card: real OpenStreetMap tiles via Leaflet, risk-colored
// mine pins, click drawer for the selected mine. Falls back to a schematic SVG
// when tiles can't load (offline demo mode).
export default function IndiaRiskMap({ mines, loading, error, onRefresh }: IndiaRiskMapProps) {
  const [selectedId, setSelectedId] = useState<string | null>("M-002");
  const [useLeaflet, setUseLeaflet] = useState(true);
  const { data: capturesData } = useFieldCaptures(40);
  const captures = (capturesData?.items ?? []).filter((c) => c.lat != null && c.lng != null);
  const selected = mines.find((m) => m.id === selectedId) ?? null;
  const selectedBand = selected ? riskBand(selected.risk) : null;
  const position = selected ? [selected.lat, selected.lng] : [22.0, 82.0];

  return (
    <div className="rounded-lg border border-[#e3ebe6] bg-white shadow-sm" data-testid="mine-risk-map-card">
      <div className="flex items-start justify-between px-5 pt-4">
        <div className="space-y-1.5">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[#0d9488]">
            Live geo-intelligence
          </p>
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-medium text-[#1e293b]">Mine risk map</h2>
            <span className="flex items-center gap-1.5 rounded border border-[#dbe7e1] px-1.5 py-0.5 font-mono text-[11px] text-[#334155]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#0d9488] motion-safe:animate-pulse" />
              Live
            </span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Refresh mine risk map"
          data-testid="map-refresh-button"
          onClick={onRefresh}
        >
          <RefreshCw className="h-4 w-4 text-[#64748b]" />
        </Button>
      </div>

      <div className="px-5 pb-5 pt-3">
        <div className="relative h-[400px] rounded-md bg-[#f8faf9]">
          {error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-[#64748b]">
                Live feed unavailable
              </p>
              <Button variant="outline" size="sm" onClick={onRefresh} data-testid="map-retry-button">
                Retry
              </Button>
            </div>
          ) : loading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-full w-full animate-pulse bg-[#eef4f1]" />
            </div>
          ) : useLeaflet ? (
            <div className="h-full w-full">
              <MapContainer
                center={position as [number, number]}
                zoom={7}
                className="h-full w-full"
                style={{ borderRadius: "8px" }}
                zoomControl={true}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors'
                />
                <FitBounds mines={mines} />
                {mines.map((mine) => {
                  const color = RISK_COLORS[riskBand(mine.risk)];
                  return (
                    <CircleMarker
                      key={mine.id}
                      center={[mine.lat, mine.lng]}
                      radius={9}
                      color={color}
                      fillColor={color}
                      fillOpacity={0.35}
                      weight={2}
                      eventHandlers={{
                        click: () => setSelectedId(mine.id),
                      }}
                      data-testid={`map-marker-${mine.id.toLowerCase()}`}
                    >
                      <Popup>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-[13px] font-medium text-[#1e293b]">{mine.name}</p>
                            <p className="mt-0.5 text-xs text-[#64748b]">
                              {mine.state} · {mine.id}
                            </p>
                          </div>
                          <p className="leading-none">
                            <span className="text-[16px] font-semibold" style={{ color: color }}>
                              {mine.risk}
                            </span>
                            <span className="font-mono text-[10px] text-[#94a3b8]">/100</span>
                          </p>
                        </div>
                      </Popup>
                    </CircleMarker>
                  );
                })}
                {captures.map((c) => (
                  <CircleMarker
                    key={c.id}
                    center={[c.lat as number, c.lng as number]}
                    radius={4}
                    color="#f59e0b"
                    fillColor="#f59e0b"
                    fillOpacity={0.8}
                    weight={1}
                    data-testid={`map-capture-${c.id.toLowerCase()}`}
                  >
                    <Popup>
                      <div className="text-[12px] text-[#1e293b]">
                        <p className="font-mono text-[11px] font-semibold text-[#b45309]">
                          {c.id} · {c.kind}
                        </p>
                        <p className="mt-1">{c.note}</p>
                        <p className="mt-1 text-[11px] text-[#64748b]">
                          {c.mine_id ?? "unassigned"} · {new Date(c.captured_at).toLocaleString()}
                        </p>
                      </div>
                    </Popup>
                  </CircleMarker>
                ))}
              </MapContainer>
            </div>
          ) : (
            // Fallback schematic SVG (offline demo).
            <div className="cs-dotgrid relative h-[400px] overflow-hidden rounded-md bg-[#f8faf9]">
              <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="h-full w-full" role="img" aria-label="Map of India with mine risk markers">
                <text
                  x={VIEW_W / 2}
                  y={VIEW_H / 2 + 18}
                  textAnchor="middle"
                  fontFamily="'IBM Plex Mono', monospace"
                  fontWeight={700}
                  fontSize={46}
                  letterSpacing={16}
                  fill="rgba(100, 116, 139, 0.10)"
                >
                  INDIA
                </text>
                <polygon
                  points={POLYGON_POINTS}
                  fill="#eef4f0"
                  stroke="#94a3b8"
                  strokeWidth={1.4}
                  strokeLinejoin="round"
                />
                {mines.map((mine) => {
                  const [x, y] = project(mine.lng, mine.lat);
                  const color = RISK_COLORS[riskBand(mine.risk)];
                  return (
                    <g
                      key={mine.id}
                      transform={`translate(${x}, ${y})`}
                      onClick={() => setSelectedId(mine.id)}
                      className="cursor-pointer"
                      data-testid={`map-marker-${mine.id.toLowerCase()}`}
                      role="button"
                      aria-label={`${mine.name} risk ${mine.risk} of 100`}
                    >
                      <rect x={-28} y={-16} width={56} height={46} fill="transparent" />
                      <circle r={11} fill="none" stroke={color} strokeWidth={1} opacity={0.3} />
                      <circle r={6.5} fill="none" stroke={color} strokeWidth={2} opacity={0.8} />
                      <circle r={2.6} fill="#1e293b" />
                      <text y={24} textAnchor="middle" fontSize={10.5} fill="#334155" fontFamily="'IBM Plex Sans', sans-serif">
                        {mine.name.replace(/ (North|East|West|Deep)$/, "")}
                      </text>
                    </g>
                  );
                })}
              </svg>
              <div className="absolute bottom-3 left-4 flex items-center gap-4 rounded bg-white/80 px-2.5 py-1">
                {LEGEND.map((band) => (
                  <span key={band} className="flex items-center gap-1.5 font-mono text-[11px] text-[#64748b]">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: RISK_COLORS[band] }} />
                    {band === "low" ? "Low" : band === "watch" ? "Watch" : "High"}
                  </span>
                ))}
              </div>
            </div>
          )}

          {selected && selectedBand && (
            <div
              data-testid="map-risk-popup"
              className="absolute w-60 rounded-lg border border-[#fecaca] bg-white p-4 shadow-lg z-20"
              style={{ left: "6px", top: "8px" }}
            >
              <div className="flex items-center justify-between">
                <span className="rounded bg-[#fee2e2] px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-[0.12em] text-[#991b1b]">
                  {RISK_LABEL[selectedBand].toUpperCase()}
                </span>
                <button
                  aria-label="Close mine popup"
                  data-testid="map-popup-close"
                  className="text-[#94a3b8] transition-colors hover:text-[#1e293b]"
                  onClick={() => setSelectedId(null)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-2 flex items-start justify-between gap-2">
                <div>
                  <p className="text-[17px] font-medium text-[#1e293b]">{selected.name}</p>
                  <p className="mt-0.5 text-xs text-[#64748b]">
                    {selected.state} · {selected.id}
                  </p>
                </div>
                <p className="leading-none">
                  <span className="text-[22px] font-semibold" style={{ color: RISK_COLORS[selectedBand] }}>
                    {selected.risk}
                  </span>
                  <span className="font-mono text-[11px] text-[#94a3b8]">/100</span>
                </p>
              </div>
              <div className="mt-3 flex items-center gap-2 font-mono text-[11px] text-[#64748b]">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: RISK_COLORS[selectedBand] }} />
                {selectedBand === "low" ? "Low risk" : selectedBand === "watch" ? "Watch" : "High risk"}
              </div>
            </div>
          )}
        </div>

        <div className="absolute bottom-3 left-4 flex items-center gap-4 rounded bg-white/90 px-3 py-1.5 border border-[#e3ebe6]">
          {LEGEND.map((band) => (
            <span key={band} className="flex items-center gap-1.5 font-mono text-[11px] text-[#64748b]">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: RISK_COLORS[band] }} />
              {band === "low" ? "Low" : band === "watch" ? "Watch" : "High"}
            </span>
          ))}
          {captures.length > 0 && (
            <span
              className="flex items-center gap-1.5 font-mono text-[11px] text-[#64748b]"
              data-testid="map-capture-legend"
            >
              <span className="h-2 w-2 rounded-full bg-[#f59e0b]" />
              Field · {captures.length}
            </span>
          )}
        </div>

        {useLeaflet && (
          <button
            data-testid="map-fallback-button"
            className="absolute bottom-3 right-3 h-8 w-8 rounded border border-[#e3ebe6] bg-white flex items-center justify-center text-[#64748b] hover:text-[#0d9488] transition-colors"
            onClick={() => setUseLeaflet(false)}
            title="Switch to schematic map"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        )}
        {!useLeaflet && (
          <button
            data-testid="map-live-button"
            className="absolute bottom-3 right-3 h-8 w-8 rounded border border-[#e3ebe6] bg-white flex items-center justify-center text-[#64748b] hover:text-[#0d9488] transition-colors"
            onClick={() => setUseLeaflet(true)}
            title="Switch to live map"
          >
            <RefreshCw className="h-4 w-4 rotate-180" />
          </button>
        )}
      </div>
    </div>
  );
}
