import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type * as THREE from "three";
import type { VectorSnapshot } from "../types";
import { vectorToPosition } from "../types";

interface UserMarkerProps {
  vector: VectorSnapshot;
}

export function UserMarker({ vector }: UserMarkerProps) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const glowRef = useRef<THREE.Mesh>(null!);
  const pos = vectorToPosition(vector);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    // Pulse the core
    const pulse = 1 + Math.sin(t * 3) * 0.1;
    if (meshRef.current) meshRef.current.scale.setScalar(pulse);
    // Pulse the glow ring
    const glowPulse = 1 + Math.sin(t * 2) * 0.15;
    if (glowRef.current) {
      glowRef.current.scale.setScalar(glowPulse);
      (glowRef.current.material as THREE.MeshBasicMaterial).opacity = 0.12 + Math.sin(t * 3) * 0.06;
    }
  });

  return (
    <group position={pos}>
      {/* Outer glow sphere */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.22, 24, 24]} />
        <meshBasicMaterial color="#a78bfa" transparent opacity={0.15} depthWrite={false} />
      </mesh>

      {/* Core sphere */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.1, 32, 32]} />
        <meshStandardMaterial color="#a78bfa" emissive="#a78bfa" emissiveIntensity={0.7} />
      </mesh>

      {/* Small ring around the marker */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.16, 0.008, 16, 64]} />
        <meshBasicMaterial color="#a78bfa" transparent opacity={0.4} />
      </mesh>
    </group>
  );
}
