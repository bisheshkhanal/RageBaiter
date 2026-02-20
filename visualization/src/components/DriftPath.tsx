import { useState, useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, CatmullRomLine } from "@react-three/drei";
import * as THREE from "three";
import type { HistoryEntry } from "../types";
import { rageColor, vectorToPosition } from "../types";

interface DriftPathProps {
  history: HistoryEntry[];
}

function WaypointMarker({ entry, index }: { entry: HistoryEntry; index: number }) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const [hovered, setHovered] = useState(false);
  const pos = vectorToPosition(entry.user_vector_snapshot);
  const color = rageColor(entry.rage_score);
  // size(90) is 3x size(10): base * (0.5 + score/60)
  const size = 0.06 * (0.5 + entry.rage_score / 60);

  useFrame(() => {
    if (meshRef.current) {
      // Gentle float
      meshRef.current.position.y = pos[1] + Math.sin(Date.now() * 0.002 + index) * 0.01;
    }
  });

  return (
    <group>
      <mesh
        ref={meshRef}
        position={pos}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "default";
        }}
        scale={hovered ? 1.6 : 1}
      >
        <sphereGeometry args={[size, 16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={hovered ? 0.8 : 0.4}
          transparent
          opacity={0.9}
        />
      </mesh>

      {hovered && (
        <Html
          position={[pos[0], pos[1] + size + 0.1, pos[2]]}
          center
          distanceFactor={10}
          style={{ pointerEvents: "none", transition: "opacity 0.2s", opacity: hovered ? 1 : 0 }}
        >
          <div
            className="glass px-3 py-2 rounded-lg border border-white/10 shadow-xl backdrop-blur-xl"
            style={{
              background: "rgba(10, 10, 20, 0.85)",
              minWidth: "220px",
              maxWidth: "280px",
              transform: "translateY(-50%)",
            }}
          >
            <div className="flex justify-between items-start mb-1.5 border-b border-white/10 pb-1.5">
              <span className="text-[10px] uppercase tracking-wider font-bold text-white/50">
                {entry.interaction}
              </span>
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                style={{
                  background: color,
                  color: entry.rage_score > 60 ? "#000" : "#fff",
                }}
              >
                RAGE: {entry.rage_score}
              </span>
            </div>

            <div className="text-xs text-white/90 italic leading-snug mb-2 font-serif">
              "
              {entry.tweet_text.length > 120
                ? entry.tweet_text.slice(0, 120) + "…"
                : entry.tweet_text}
              "
            </div>

            {(entry.topic || (entry.fallacies && entry.fallacies.length > 0)) && (
              <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-white/5">
                {entry.topic && (
                  <span className="text-[9px] px-1.5 py-0.5 bg-white/5 rounded text-white/60">
                    {entry.topic}
                  </span>
                )}
                {entry.fallacies?.map((f) => (
                  <span
                    key={f}
                    className="text-[9px] px-1.5 py-0.5 bg-red-500/10 text-red-300 rounded border border-red-500/20"
                  >
                    {f}
                  </span>
                ))}
              </div>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}

export function DriftPath({ history }: DriftPathProps) {
  if (history.length < 2) return null;

  // Build smooth curve points
  const points = useMemo(() => {
    return history.map((e) => new THREE.Vector3(...vectorToPosition(e.user_vector_snapshot)));
  }, [history]);

  // Gradient colors along the path
  const colors = useMemo(() => {
    return history.map((e) => new THREE.Color(rageColor(e.rage_score)));
  }, [history]);

  return (
    <group>
      {/* Smooth drift curve */}
      <CatmullRomLine
        points={points}
        vertexColors={colors}
        lineWidth={3}
        dashed={false}
        transparent
        opacity={0.8}
        curveType="catmullrom"
        tension={0.5}
      />

      {/* Waypoint markers */}
      {history.map((entry, i) => (
        <WaypointMarker key={entry.tweet_id} entry={entry} index={i} />
      ))}
    </group>
  );
}
