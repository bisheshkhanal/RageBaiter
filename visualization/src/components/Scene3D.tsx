import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars, PerspectiveCamera } from '@react-three/drei';
import { Axes3D } from './Axes3D';
import { DriftPath } from './DriftPath';
import { UserMarker } from './UserMarker';
import type { UserData } from '../types';

interface Scene3DProps {
  data: UserData;
}

function SceneContent({ data }: Scene3DProps) {
  return (
    <>
      <PerspectiveCamera makeDefault position={[3.5, 2.5, 3.5]} fov={55} />

      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 8, 5]} intensity={0.6} />
      <directionalLight position={[-5, 2, -5]} intensity={0.15} color="#8888ff" />

      {/* Background stars */}
      <Stars radius={80} depth={60} count={2000} factor={3} saturation={0.2} fade speed={0.5} />

      {/* Fog for depth */}
      <fog attach="fog" args={['#06060f', 8, 30]} />

      {/* "Deep End" corner lights — faint red glow at extremes */}
      <pointLight position={[3.6, 3.6, 3.6]} color="#ef4444" intensity={2} distance={6} decay={2} />
      <pointLight position={[3.6, 3.6, -3.6]} color="#dc2626" intensity={1} distance={5} decay={2} />
      <pointLight position={[-3.6, -3.6, -3.6]} color="#991b1b" intensity={0.6} distance={4} decay={2} />

      {/* Axes + bounding cube */}
      <Axes3D />

      {/* Drift path + waypoints */}
      <DriftPath history={data.vector_history} />

      {/* User's current position */}
      <UserMarker vector={data.current_vector} />

      {/* Controls */}
      <OrbitControls
        enablePan={false}
        minDistance={4}
        maxDistance={14}
        enableDamping
        dampingFactor={0.03}
        autoRotate
        autoRotateSpeed={0.5}
        maxPolarAngle={Math.PI / 1.5}
        minPolarAngle={Math.PI / 4}
      />
    </>
  );
}

export function Scene3D({ data }: Scene3DProps) {
  return (
    <Canvas
      gl={{ antialias: true, alpha: false }}
      dpr={[1, 2]}
      style={{ background: '#06060f' }}
    >
      <Suspense fallback={null}>
        <SceneContent data={data} />
      </Suspense>
    </Canvas>
  );
}
