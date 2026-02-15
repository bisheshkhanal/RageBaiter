import { Line, Text } from '@react-three/drei';

interface AxisDef {
  label: string;
  negLabel: string;
  posLabel: string;
  color: string;
}

const AXES: [AxisDef, [number, number, number], [number, number, number]][] = [
  [
    { label: 'Economic', negLabel: 'Left', posLabel: 'Right', color: '#ef4444' },
    [-2, 0, 0],
    [2, 0, 0],
  ],
  [
    { label: 'Social', negLabel: 'Progressive', posLabel: 'Conservative', color: '#22c55e' },
    [0, -2, 0],
    [0, 2, 0],
  ],
  [
    { label: 'Populist', negLabel: 'Anti-establishment', posLabel: 'Institutional', color: '#3b82f6' },
    [0, 0, -2],
    [0, 0, 2],
  ],
];

export function Axes3D() {
  return (
    <group>
      {AXES.map(([config, start, end], i) => (
        <group key={i}>
          <Line
            points={[start, end]}
            color={config.color}
            lineWidth={1}
            transparent
            opacity={0.4}
          />
          {/* Positive label */}
          <Text
            position={end.map((v) => v * 1.12) as [number, number, number]}
            fontSize={0.18}
            color={config.color}
            anchorX="center"
            anchorY="middle"
            fillOpacity={1}
          >
            {config.posLabel}
          </Text>
          {/* Negative label */}
          <Text
            position={start.map((v) => v * 1.12) as [number, number, number]}
            fontSize={0.18}
            color={config.color}
            anchorX="center"
            anchorY="middle"
            fillOpacity={1}
          >
            {config.negLabel}
          </Text>
        </group>
      ))}

      {/* Bounding cube */}
      <mesh>
        <boxGeometry args={[4, 4, 4]} />
        <meshBasicMaterial wireframe transparent opacity={0.04} color="#ffffff" />
      </mesh>
    </group>
  );
}
