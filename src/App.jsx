import React, { useState, useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import * as THREE from 'three';

// --- 1. PLAYER PENGUIN COMPONENT ---
function PlayerPenguin() {
  const group = useRef();
  const penguin = useGLTF("/models/penguin.glb");
  const { actions, names } = useAnimations(penguin.animations, group);
  const { camera } = useThree();

  useEffect(() => {
    if (names && names.length > 0 && actions[names[0]]) {
      actions[names[0]].reset().fadeIn(0.2).play().setEffectiveTimeScale(1.2);
    }
  }, [actions, names]);

  useFrame((_, delta) => {
    if (!group.current || !camera) return;

    // Position the penguin 1.3 meters in front of the phone screen
    // Placed slightly lower (-0.25) so it doesn't block the exact center of your view
    const targetPosition = new THREE.Vector3(0, -0.25, -1.3); 
    targetPosition.applyMatrix4(camera.matrixWorld);

    // UNLOCKED: The penguin now smoothly moves in full 3D space (including up and down!)
    group.current.position.lerp(targetPosition, delta * 5.5);

    // Keep the penguin rotated toward your phone's position
    const lookTarget = new THREE.Vector3(camera.position.x, camera.position.y, camera.position.z);
    group.current.lookAt(lookTarget);
  });

  return (
    <group ref={group} position={[0, 0, 0]}>
      {/* rotation={[0, -Math.PI / 2, 0]} corrects models that face sideways by default */}
      <primitive object={penguin.scene} scale={0.15} rotation={[0, -Math.PI / 2, 0]} />
    </group>
  );
}

// --- 2. ENVIRONMENT COMPONENT ---
function Environment() {
  const ceilingRef = useRef();

  useFrame((state) => {
    if (ceilingRef.current) {
      ceilingRef.current.rotation.z = state.clock.getElapsedTime() * 0.02;
    }
  });

  return (
    <group>
      <ambientLight intensity={0.9} color="#bae6fd" />
      <directionalLight position={[2, 8, 2]} intensity={1.5} color="#e0f2fe" />
      <pointLight position={[0, 2, 0]} intensity={0.5} color="#38bdf8" />

      {/* SOLID OCEAN FLOOR (Opaque seabed - blocks out your real floor) */}
      <mesh position={[0, -0.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial 
          color="#0b1d3a" 
          roughness={0.9} 
          metalness={0.1}
        />
      </mesh>

      {/* SEMI-TRANSPARENT ROOF (Maintains the open-air underwater look) */}
      <mesh ref={ceilingRef} position={[0, 3.0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[25, 25]} />
        <meshBasicMaterial 
          color="#0284c7" 
          transparent 
          opacity={0.35} 
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

// --- 3. SMART SPAWNER COMPONENT ---
function Spawner({ setItems }) {
  const { camera } = useThree();

  useEffect(() => {
    const interval = setInterval(() => {
      const types = ['fish', 'squid', 'plastic'];
      const itemType = types[Math.floor(Math.random() * types.length)];
      
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      forward.y = 0; 
      forward.normalize();

      const spawnDistance = 4.5 + Math.random() * 2.0;
      const lateralOffset = (Math.random() - 0.5) * 3.5;

      const spawnX = camera.position.x + (forward.x * spawnDistance) - (forward.z * lateralOffset);
      const spawnZ = camera.position.z + (forward.z * spawnDistance) + (forward.x * lateralOffset);
      
      // NEW: Spawns items within a comfortable 1-meter band relative to your physical hand height
      const spawnY = camera.position.y + (Math.random() - 0.5) * 1.0; 

      setItems((prev) => [
        ...prev,
        {
          id: Date.now() + Math.random(),
          type: itemType,
          pos: [spawnX, spawnY, spawnZ],
          speed: 1.1 + Math.random() * 0.5
        }
      ]);
    }, 2000);

    return () => clearInterval(interval);
  }, [camera, setItems]);

  return null;
}

// --- 4. GAME OBJECT RENDERER (FISH / SQUID / PLASTIC) ---
function GameItem({ type, position }) {
  // Simple geometry fallbacks based on your screenshots (Cones, Cubes, etc.)
  return (
    <mesh position={position}>
      {type === 'fish' && <coneGeometry args={[0.2, 0.5, 4]} />}
      {type === 'squid' && <boxGeometry args={[0.3, 0.3, 0.3]} />}
      {type === 'plastic' && <dodecahedronGeometry args={[0.25]} />}
      
      <meshStandardMaterial 
        color={type === 'fish' ? '#4ade80' : type === 'squid' ? '#c084fc' : '#ef4444'} 
      />
    </mesh>
  );
}

// --- 5. MAIN APP CONTAINER ---
export default function App() {
  const [gameState, setGameState] = useState('MENU'); // MENU, PLAYING, GAMEOVER
  const [items, setItems] = useState([]);
  const [score, setScore] = useState(0);
  const [fishCount, setFishCount] = useState(0);
  const [squidCount, setSquidCount] = useState(0);

  // Simple frame-by-frame tracker to handle item movement and basic collisions
  function GameLoop() {
    const { camera } = useThree();
    
    useFrame((_, delta) => {
      setItems((prevItems) => {
        return prevItems
          .map((item) => {
            // Move items slowly toward the player's core z/x plane position
            const currentPos = new THREE.Vector3(...item.pos);
            const targetPos = new THREE.Vector3(camera.position.x, currentPos.y, camera.position.z);
            const direction = new THREE.Vector3().subVectors(targetPos, currentPos).normalize();
            currentPos.addScaledVector(direction, item.speed * delta);
            
            return { ...item, pos: [currentPos.x, currentPos.y, currentPos.z] };
          })
          .filter((item) => {
            // Collision check: Distance calculation between camera (player) and item
            const itemVec = new THREE.Vector3(...item.pos);
            const dist = camera.position.distanceTo(itemVec);

            if (dist < 1.4) { // Direct hit threshold zone
              if (item.type === 'fish') {
                setScore((s) => s + 1);
                setFishCount((f) => f + 1);
              } else if (item.type === 'squid') {
                setScore((s) => s + 2);
                setSquidCount((s) => s + 1);
              } else if (item.type === 'plastic') {
                setScore((s) => Math.max(0, s - 3)); // Penalty
              }
              return false; // Remove item from scene
            }
            return itemVec.distanceTo(camera.position) < 8; // Drop if way out of bounds
          });
      });
    });

    return null;
  }

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden', background: '#000' }}>
      {/* HUD UI LAYERS */}
      {gameState === 'PLAYING' && (
        <>
          <div style={{ position: 'absolute', top: '20px', left: '20px', zIndex: 10, background: 'rgba(15, 23, 42, 0.75)', padding: '12px', borderRadius: '8px', color: '#fff', fontFamily: 'sans-serif' }}>
            <div style={{ fontWeight: 'bold', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>TARGET TRACKER</div>
            <div style={{ color: '#4ade80' }}>Fish: {fishCount}/10</div>
            <div style={{ color: '#c084fc' }}>Squid: {squidCount}/5</div>
          </div>

          <div style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 10, background: 'rgba(15, 23, 42, 0.75)', padding: '12px 24px', borderRadius: '8px', color: '#38bdf8', fontSize: '18px', fontWeight: 'bold', fontFamily: 'sans-serif' }}>
            Score: {score}
          </div>
        </>
      )}

      {gameState === 'MENU' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', zIndex: 20, background: 'rgba(11, 29, 58, 0.95)', color: '#fff', fontFamily: 'sans-serif' }}>
          <h1 style={{ fontSize: '36px', marginBottom: '8px', letterSpacing: '2px' }}>ICY AR</h1>
          <p style={{ color: '#94a3b8', marginBottom: '30px' }}>An Augmented Reality Marine Experience</p>
          <button 
            onClick={() => setGameState('PLAYING')}
            style={{ background: '#2563eb', border: 'none', color: '#fff', padding: '14px 36px', fontSize: '16px', fontWeight: 'bold', borderRadius: '8px', cursor: 'pointer', boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)' }}
          >
            START AR GAME
          </button>
        </div>
      )}

      {/* WEBGL 3D CANVAS */}
      <Canvas camera={{ position: [0, 1.5, 0], fov: 70 }}>
        <Environment />
        
        {gameState === 'PLAYING' && (
          <>
            <PlayerPenguin />
            <Spawner setItems={setItems} />
            <GameLoop />
            {items.map((item) => (
              <GameItem key={item.id} type={item.type} position={item.pos} />
            ))}
          </>
        )}
      </Canvas>
    </div>
  );
}