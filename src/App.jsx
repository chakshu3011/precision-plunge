import React, { useState, useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import * as THREE from 'three';

// --- EXTRA ENGINE UTILITY: XR BINDER ---
// This hooks the Three.js canvas directly into your phone's physical AR tracking hardware
function XRManager({ session }) {
  const { gl } = useThree();
  useEffect(() => {
    if (session) {
      gl.xr.enabled = true;
      gl.xr.setReferenceSpaceType('local-floor');
      gl.xr.setSession(session).catch((err) => console.error("XR Session Bind Error:", err));
    }
  }, [session, gl]);
  return null;
}

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
    const targetPosition = new THREE.Vector3(0, -0.25, -1.3); 
    targetPosition.applyMatrix4(camera.matrixWorld);

    // Moves the penguin in 3D space following your phone's tracking coordinates
    group.current.position.lerp(targetPosition, delta * 5.5);

    // FIXED: Lock lookTarget's Y position to the penguin's own Y coordinate.
    // This stops the penguin from tilting up/down or flipping upside down when you raise the phone.
    const lookTarget = new THREE.Vector3(camera.position.x, group.current.position.y, camera.position.z);
    group.current.lookAt(lookTarget);
  });

  return (
    <group ref={group}>
      {/* Inner group isolates the default model shift so it doesn't fight the lookAt system */}
      <group rotation={[0, -Math.PI / 2, 0]}>
        <primitive object={penguin.scene} scale={0.15} />
      </group>
    </group>
  );
}

// --- 2. ENVIRONMENT COMPONENT (UPDATED WITH CUSTOM REEF & AR ALPHA FILTER) ---
function Environment() {
  const ceilingRef = useRef();
  
  // Load your new Sketchfab model
  const { scene } = useGLTF("/models/seabed.glb");

  // This runs once when the model loads to find the sand floor and make it see-through
  useEffect(() => {
    if (scene) {
      scene.traverse((child) => {
        if (child.isMesh) {
          // Enable shadows and beautiful lighting on the rocks/grass
          child.castShadow = true;
          child.receiveShadow = true;

          const meshName = child.name.toLowerCase();
          
          // Target the sand bed specifically so it doesn't block the AR camera feed
          if (meshName.includes('sand') || meshName.includes('floor') || meshName.includes('ground')) {
            child.material.transparent = true;
            child.material.opacity = 0.15; // Keeps a faint tracking hint, but lets your room shine through
          }
        }
      });
    }
  }, [scene]);

  useFrame((state) => {
    if (ceilingRef.current) {
      ceilingRef.current.rotation.z = state.clock.getElapsedTime() * 0.02;
    }
  });

  return (
    <group>
      {/* Dynamic underwater lighting setup */}
      <ambientLight intensity={0.9} color="#bae6fd" />
      <directionalLight position={[2, 8, 2]} intensity={1.5} color="#e0f2fe" />
      <pointLight position={[0, 2, 0]} intensity={0.5} color="#38bdf8" />

      {/* YOUR CUSTOM SKETCHFAB SEABED MODEL */}
      {/* Positioned slightly down (-1.4m) so it sits naturally right below your gameplay field */}
      <primitive 
        object={scene} 
        position={[0, -1.4, -1.5]} 
        scale={[1.2, 1.2, 1.2]} // Adjust this scale up or down if the reef looks too small/large in AR
      />

      {/* SEMI-TRANSPARENT WATER SURFACE CEILING */}
      <mesh ref={ceilingRef} position={[0, 3.0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[25, 25]} />
        <meshBasicMaterial 
          color="#0284c7" 
          transparent 
          opacity={0.25} 
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
      
      // Spawns items dynamically matching the general height of your hand/phone
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

// --- 4. GAME OBJECT RENDERER ---
function GameItem({ type, position }) {
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
  const [gameState, setGameState] = useState('MENU'); 
  const [items, setItems] = useState([]);
  const [score, setScore] = useState(0);
  const [fishCount, setFishCount] = useState(0);
  const [squidCount, setSquidCount] = useState(0);
  const [xrSession, setXrSession] = useState(null);

  // Native WebXR System Trigger
  const initiateXRSession = async () => {
    if (!navigator.xr) {
      // Fallback if testing on a regular desktop browser
      setGameState('PLAYING');
      return;
    }
    try {
      const session = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['local-floor']
      });
      setXrSession(session);
      setGameState('PLAYING');

      session.addEventListener('end', () => {
        setGameState('MENU');
        setXrSession(null);
      });
    } catch (e) {
      console.error("Failed to start AR Session:", e);
      setGameState('PLAYING');
    }
  };

  function GameLoop() {
    const { camera } = useThree();
    
    useFrame((_, delta) => {
      setItems((prevItems) => {
        return prevItems
          .map((item) => {
            const currentPos = new THREE.Vector3(...item.pos);
            const targetPos = new THREE.Vector3(camera.position.x, currentPos.y, camera.position.z);
            const direction = new THREE.Vector3().subVectors(targetPos, currentPos).normalize();
            currentPos.addScaledVector(direction, item.speed * delta);
            
            return { ...item, pos: [currentPos.x, currentPos.y, currentPos.z] };
          })
          .filter((item) => {
            const itemVec = new THREE.Vector3(...item.pos);
            const dist = camera.position.distanceTo(itemVec);

            if (dist < 1.4) { 
              if (item.type === 'fish') {
                setScore((s) => s + 1);
                setFishCount((f) => f + 1);
              } else if (item.type === 'squid') {
                setScore((s) => s + 2);
                setSquidCount((s) => s + 1);
              } else if (item.type === 'plastic') {
                setScore((s) => Math.max(0, s - 3)); 
              }
              return false; 
            }
            return itemVec.distanceTo(camera.position) < 8; 
          });
      });
    });

    return null;
  }

  return (
    <div 
      style={{ 
        width: '100vw', 
        height: '100vh', 
        position: 'relative', 
        overflow: 'hidden', 
        // FIXED: The background turns transparent during play mode so your camera feed can show through
        background: gameState === 'PLAYING' ? 'transparent' : '#0b1d3a' 
      }}
    >
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

      {/* INTRO SCREEN WITH FIXED INSTRUCTIONS ATTACHED */}
      {gameState === 'MENU' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', zIndex: 20, background: 'rgba(11, 29, 58, 0.95)', color: '#fff', fontFamily: 'sans-serif', padding: '20px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '36px', marginBottom: '8px', letterSpacing: '2px' }}>ICY AR</h1>
          <p style={{ color: '#94a3b8', marginBottom: '20px' }}>An Augmented Reality Marine Experience</p>
          
          {/* Instructions Block Restored */}
          <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '15px 25px', borderRadius: '8px', marginBottom: '30px', fontSize: '14px', color: '#e2e8f0', maxWidth: '300px', lineHeight: '1.6', border: '1px solid rgba(255,255,255,0.1)' }}>
            <strong>How to Play:</strong><br />
            Move your phone up, down, left, and right to steer the penguin. Swim into items to collect points while avoiding red plastic hazards!
          </div>

          <button 
            onClick={initiateXRSession}
            style={{ background: '#2563eb', border: 'none', color: '#fff', padding: '14px 36px', fontSize: '16px', fontWeight: 'bold', borderRadius: '8px', cursor: 'pointer', boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)' }}
          >
            START AR GAME
          </button>
        </div>
      )}

      {/* WEBGL 3D CANVAS - FIXED WITH ALPHA ACCESS */}
      <Canvas 
        camera={{ position: [0, 1.5, 0], fov: 70 }}
        gl={{ alpha: true, alpha: true }} 
      >
        <XRManager session={xrSession} />
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