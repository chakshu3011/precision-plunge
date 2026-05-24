import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib'; // CRITICAL: Prevents 2nd-trial animation freezes

// Preload assets
useGLTF.preload("/models/penguin.glb");
useGLTF.preload("/models/seabed.glb");
useGLTF.preload("/models/fish.glb");
useGLTF.preload("/models/squid.glb");
useGLTF.preload("/models/plastic.glb");

// --- EXTRA ENGINE UTILITY: XR BINDER ---
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
  const { scene, animations } = useGLTF("/models/penguin.glb");
  
  // FIX: Safely clones the skeleton so it never freezes on the 2nd trial
  const clonedScene = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const mixer = useMemo(() => new THREE.AnimationMixer(clonedScene), [clonedScene]);
  const { camera } = useThree();

  useEffect(() => {
    if (animations && animations.length > 0) {
      mixer.clipAction(animations[0]).reset().play();
    }
    return () => mixer.stopAllAction();
  }, [mixer, animations]);

  useFrame((_, delta) => {
    mixer.update(delta); 
    
    if (!group.current) return;
    const targetPosition = new THREE.Vector3(0, -0.25, -1.3);
    targetPosition.applyMatrix4(camera.matrixWorld);
    group.current.position.lerp(targetPosition, delta * 5.5);
    
    const lookTarget = new THREE.Vector3(camera.position.x, group.current.position.y, camera.position.z);
    group.current.lookAt(lookTarget);
  });

  return (
    <group ref={group}>
      <group rotation={[0, -Math.PI / 2 + Math.PI, 0]}>
        <primitive object={clonedScene} scale={0.15} />
      </group>
    </group>
  );
}

// --- 2. ENVIRONMENT COMPONENT ---
function Environment() {
  const { scene, animations } = useGLTF("/models/seabed.glb");
  
  const clonedScene = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const mixer = useMemo(() => new THREE.AnimationMixer(clonedScene), [clonedScene]);

  useEffect(() => {
    if (animations && animations.length > 0) {
      animations.forEach((clip) => mixer.clipAction(clip).reset().play());
    }
    if (clonedScene) {
      clonedScene.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          const meshName = child.name.toLowerCase();
          if (meshName.includes('sand') || meshName.includes('floor') || meshName.includes('ground')) {
            child.material.transparent = true;
            child.material.opacity = 0.15; 
          }
        }
      });
    }
    return () => mixer.stopAllAction();
  }, [clonedScene, animations, mixer]);

  useFrame((_, delta) => mixer.update(delta));

  return (
    <group>
      <ambientLight intensity={0.9} color="#bae6fd" />
      <directionalLight position={[2, 8, 2]} intensity={1.5} color="#e0f2fe" />
      <pointLight position={[0, 2, 0]} intensity={0.5} color="#38bdf8" />
      <primitive object={clonedScene} position={[0, -1.4, -1.5]} scale={[1.2, 1.2, 1.2]} />
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
      const spawnY = camera.position.y + (Math.random() - 0.5) * 1.0; 

      setItems((prev) => [
        ...prev,
        {
          id: Date.now() + Math.random(),
          type: itemType,
          pos: [spawnX, spawnY, spawnZ],
          // SLOWER SPEED APPLIED
          speed: 0.3 + Math.random() * 0.3 
        }
      ]);
    }, 2000);

    return () => clearInterval(interval);
  }, [camera, setItems]);

  return null;
}

// --- 4. GAME OBJECT RENDERERS ---
function AnimatedItem({ modelPath, position, scale }) {
  const group = useRef();
  const { scene, animations } = useGLTF(modelPath);
  
  const clonedScene = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const mixer = useMemo(() => new THREE.AnimationMixer(clonedScene), [clonedScene]);

  useEffect(() => {
    let action;
    if (animations && animations.length > 0) {
      action = mixer.clipAction(animations[0]);
      action.reset().play().setEffectiveTimeScale(1.5); 
    }
    return () => {
      if (action) action.stop();
      mixer.stopAllAction();
    };
  }, [mixer, animations]);

  useFrame((_, delta) => mixer.update(delta));

  return (
    <group ref={group} position={position}>
      <primitive object={clonedScene} scale={scale} />
    </group>
  );
}

function StaticItem({ modelPath, position, scale }) {
  const group = useRef();
  const { scene } = useGLTF(modelPath);
  const clonedScene = useMemo(() => scene.clone(), [scene]);
  
  useFrame((_, delta) => {
    if (group.current) {
      group.current.rotation.x += delta * 0.5;
      group.current.rotation.y += delta * 0.5;
    }
  });

  return (
    <group ref={group} position={position}>
      <primitive object={clonedScene} scale={scale} />
    </group>
  );
}

// REQUESTED SIZES APPLIED
function GameItem({ type, position }) {
  if (type === 'fish') return <AnimatedItem modelPath="/models/fish.glb" position={position} scale={0.0015} />;
  if (type === 'squid') return <AnimatedItem modelPath="/models/squid.glb" position={position} scale={0.5} />;
  if (type === 'plastic') return <StaticItem modelPath="/models/plastic.glb" position={position} scale={0.015} />;
  return null;
}

// --- 5. MAIN APP CONTAINER ---
export default function App() {
  const [gameState, setGameState] = useState('MENU'); 
  const [items, setItems] = useState([]);
  
  // HEALTH BAR STATE
  const [health, setHealth] = useState(50); // Max 100
  const [fishCount, setFishCount] = useState(0);
  const [squidCount, setSquidCount] = useState(0);
  
  // 1 MINUTE TIMER
  const [timeLeft, setTimeLeft] = useState(60); 
  const [xrSession, setXrSession] = useState(null);

  // AUDIO REFS
  const ambienceAudio = useRef(null);
  const chirpAudio = useRef(null);
  const collectAudio = useRef(null);

  useEffect(() => {
    ambienceAudio.current = new Audio("/audios/antarctic_ambience.mp3");
    ambienceAudio.current.loop = true;
    ambienceAudio.current.volume = 0.4;

    chirpAudio.current = new Audio("/audios/baby_penguin.mp3");
    chirpAudio.current.volume = 1.0;

    collectAudio.current = new Audio("/audios/fish_collect.mp3");
    collectAudio.current.volume = 0.8;

    return () => {
      if (ambienceAudio.current) ambienceAudio.current.pause();
      if (chirpAudio.current) chirpAudio.current.pause();
    };
  }, []);

  // Timer Logic & Game Over Audio
  useEffect(() => {
    let timer;
    if (gameState === 'PLAYING' && timeLeft > 0 && health > 0) {
      timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    } else if ((timeLeft === 0 || health <= 0) && gameState === 'PLAYING') {
      setGameState('GAMEOVER');
      
      if (ambienceAudio.current) ambienceAudio.current.pause();
      if (chirpAudio.current) {
        chirpAudio.current.currentTime = 0;
        chirpAudio.current.play().catch(e => console.log("Audio play blocked:", e));
      }

      if (xrSession) {
        xrSession.end(); 
      }
    }
    return () => clearInterval(timer);
  }, [gameState, timeLeft, health, xrSession]);

  const initiateXRSession = async () => {
    if (!navigator.xr) {
      setGameState('PLAYING');
      return;
    }
    try {
      const session = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['local-floor', 'dom-overlay'],
        domOverlay: { root: document.getElementById('xr-overlay') || document.body }
      });
      
      setXrSession(session);
      setHealth(50);
      setFishCount(0);
      setSquidCount(0);
      setTimeLeft(60); 
      setItems([]);
      setGameState('PLAYING');

      // Start Ambient Audio
      if (ambienceAudio.current) {
        ambienceAudio.current.currentTime = 0;
        ambienceAudio.current.play().catch(e => console.log("Audio play blocked:", e));
      }

      session.addEventListener('end', () => {
        setGameState('MENU');
        setXrSession(null);
        if (ambienceAudio.current) ambienceAudio.current.pause();
      });
    } catch (e) {
      console.error("Failed to start AR Session:", e);
      setGameState('PLAYING');
    }
  };

  // Safe State Updater for Collections
  const handleCollect = (type) => {
    if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(40);
    }
    if (collectAudio.current) {
      collectAudio.current.currentTime = 0;
      collectAudio.current.play().catch(e => console.log("Audio blocked:", e));
    }

    if (type === 'fish') {
      setHealth((h) => Math.min(100, h + 10)); // +1x
      setFishCount((f) => f + 1);
    } else if (type === 'squid') {
      setHealth((h) => Math.min(100, h + 20)); // +2x
      setSquidCount((s) => s + 1);
    } else if (type === 'plastic') {
      setHealth((h) => Math.max(0, h - 20));   // -2x
    }
  };

  function GameLoop({ onCollect }) {
    const { camera } = useThree();
    
    useFrame((_, delta) => {
      setItems((prevItems) => {
        let collectedType = null;

        const nextItems = prevItems.map((item) => {
          const currentPos = new THREE.Vector3(...item.pos);
          const targetPos = new THREE.Vector3(camera.position.x, currentPos.y, camera.position.z);
          
          // FIX: Prevents NaN math collapse (blinking at origin)
          const direction = new THREE.Vector3().subVectors(targetPos, currentPos);
          if (direction.lengthSq() > 0.001) {
            direction.normalize();
            currentPos.addScaledVector(direction, item.speed * delta);
          }
          
          return { ...item, pos: [currentPos.x, currentPos.y, currentPos.z] };
        }).filter((item) => {
          const itemVec = new THREE.Vector3(...item.pos);
          
          // FIX: Tighter hit detection accurately placed at the penguin's beak
          const penguinPos = new THREE.Vector3(0, -0.25, -1.3).applyMatrix4(camera.matrixWorld);
          const distToPenguin = penguinPos.distanceTo(itemVec);

          if (distToPenguin < 0.45) { 
            collectedType = item.type;
            return false; // Safely delete item from scene
          }
          
          return itemVec.distanceTo(camera.position) < 8; 
        });

        // Safely triggers the UI outside of the ThreeJS rendering frame
        if (collectedType) {
          setTimeout(() => onCollect(collectedType), 0);
        }

        return nextItems;
      });
    });
    return null;
  }

  return (
    <div id="xr-overlay" style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden', background: gameState === 'PLAYING' ? 'transparent' : '#0b1d3a' }}>
      
      {/* GAMEPLAY HUD */}
      {gameState === 'PLAYING' && (
        <>
          <div style={{ position: 'absolute', top: '20px', left: '20px', zIndex: 10, background: 'rgba(15, 23, 42, 0.75)', padding: '12px', borderRadius: '8px', color: '#fff', fontFamily: 'sans-serif' }}>
            <div style={{ fontWeight: 'bold', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>TARGET TRACKER</div>
            <div style={{ color: '#4ade80' }}>Fish: {fishCount}</div>
            <div style={{ color: '#c084fc' }}>Squid: {squidCount}</div>
          </div>

          <div style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 10, background: 'rgba(15, 23, 42, 0.75)', padding: '12px 24px', borderRadius: '8px', textAlign: 'center', fontFamily: 'sans-serif' }}>
            <div style={{ color: timeLeft <= 10 ? '#ef4444' : '#fff', fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
              0:{timeLeft.toString().padStart(2, '0')}
            </div>
            
            {/* HEALTH BAR SYSTEM */}
            <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px', textAlign: 'right' }}>ENERGY</div>
            <div style={{ width: '120px', height: '14px', background: 'rgba(0,0,0,0.6)', borderRadius: '10px', overflow: 'hidden', border: '2px solid rgba(255,255,255,0.2)' }}>
              <div style={{ 
                width: `${health}%`, 
                height: '100%', 
                background: health > 30 ? '#4ade80' : '#ef4444',
                transition: 'width 0.3s ease-out, background-color 0.3s ease'
              }} />
            </div>
          </div>
        </>
      )}

      {/* MAIN MENU */}
      {gameState === 'MENU' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', zIndex: 20, background: 'rgba(11, 29, 58, 0.95)', color: '#fff', fontFamily: 'sans-serif', padding: '20px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '36px', marginBottom: '8px', letterSpacing: '2px' }}>ICY AR</h1>
          <p style={{ color: '#94a3b8', marginBottom: '20px' }}>An Augmented Reality Marine Experience</p>
          
          <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '15px 25px', borderRadius: '8px', marginBottom: '30px', fontSize: '14px', color: '#e2e8f0', maxWidth: '300px', lineHeight: '1.6', border: '1px solid rgba(255,255,255,0.1)' }}>
            <strong>How to Play:</strong><br />
            Move your phone up, down, left, and right to steer the penguin. Catch fish and squid to fill your Energy Bar! Avoid red plastic hazards! You have 60 seconds.
          </div>

          <button onClick={initiateXRSession} style={{ background: '#2563eb', border: 'none', color: '#fff', padding: '14px 36px', fontSize: '16px', fontWeight: 'bold', borderRadius: '8px', cursor: 'pointer', boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)' }}>
            START AR GAME
          </button>
        </div>
      )}

      {/* GAME OVER SCREEN */}
      {gameState === 'GAMEOVER' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', zIndex: 20, background: 'rgba(11, 29, 58, 0.95)', color: '#fff', fontFamily: 'sans-serif', padding: '20px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '42px', marginBottom: '8px', color: health <= 0 ? '#ef4444' : '#f8fafc' }}>
            {health <= 0 ? "OUT OF ENERGY!" : "TIME'S UP!"}
          </h1>
          
          <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '24px 40px', borderRadius: '12px', margin: '20px 0 30px 0', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ fontSize: '16px', color: '#94a3b8', marginBottom: '8px' }}>FINAL BATTERY LEVEL</div>
            <div style={{ fontSize: '48px', fontWeight: 'bold', color: health > 30 ? '#4ade80' : '#ef4444', marginBottom: '16px' }}>{health}%</div>
            
            <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', fontSize: '14px' }}>
              <span style={{ color: '#4ade80' }}>Fish: {fishCount}</span>
              <span style={{ color: '#c084fc' }}>Squid: {squidCount}</span>
            </div>
          </div>

          <button onClick={() => setGameState('MENU')} style={{ background: '#2563eb', border: 'none', color: '#fff', padding: '14px 36px', fontSize: '16px', fontWeight: 'bold', borderRadius: '8px', cursor: 'pointer', boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)' }}>
            PLAY AGAIN
          </button>
        </div>
      )}

      <Canvas camera={{ position: [0, 1.5, 0], fov: 70 }} gl={{ alpha: true }}>
        <XRManager session={xrSession} />
        <Environment />
        {gameState === 'PLAYING' && (
          <>
            <PlayerPenguin />
            <Spawner setItems={setItems} />
            <GameLoop onCollect={handleCollect} />
            {items.map((item) => (
              <GameItem key={item.id} type={item.type} position={item.pos} />
            ))}
          </>
        )}
      </Canvas>
    </div>
  );
}