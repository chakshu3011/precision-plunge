import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';

// Preload assets
useGLTF.preload("/models/penguin.glb");
useGLTF.preload("/models/seabed.glb");
useGLTF.preload("/models/fish.glb");
useGLTF.preload("/models/squid.glb");
useGLTF.preload("/models/plastic.glb");

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

// 1. UPDATED: Bubbles are now perfect 3D spheres instead of 2D squares
function Bubbles() {
  const meshRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const [particles] = useState(() => {
    const temp = [];
    for (let i = 0; i < 75; i++) {
      temp.push({
        pos: [(Math.random() - 0.5) * 10, Math.random() * 5, (Math.random() - 0.5) * 10],
        vel: Math.random() * 0.5 + 0.2
      });
    }
    return temp;
  });

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    particles.forEach((p, i) => {
      p.pos[1] += p.vel * delta; 
      if (p.pos[1] > 4) {
        p.pos[1] = -1.5; 
      }
      dummy.position.set(p.pos[0], p.pos[1], p.pos[2]);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[null, null, 75]}>
      <sphereGeometry args={[0.03, 16, 16]} />
      <meshBasicMaterial color="white" transparent opacity={0.6} />
    </instancedMesh>
  );
}

function PlayerPenguin() {
  const group = useRef();
  const { scene, animations } = useGLTF("/models/penguin.glb");
  const { actions, names } = useAnimations(animations, group);
  const { camera } = useThree();

  useEffect(() => {
    if (names && names.length > 0 && actions[names[0]]) {
      actions[names[0]].reset().play();
    }
  }, [actions, names]);

  useFrame((_, delta) => {
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
        <primitive object={scene} scale={0.15} />
      </group>
    </group>
  );
}

function Environment() {
  const group = useRef();
  const { scene, animations } = useGLTF("/models/seabed.glb");
  const { actions, names } = useAnimations(animations, group);

  useEffect(() => {
    if (names && names.length > 0) {
      names.forEach(name => {
        if (actions[name]) actions[name].reset().play();
      });
    }
    if (scene) {
      scene.traverse((child) => {
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
  }, [scene, actions, names]);

  return (
    <group ref={group}>
      <ambientLight intensity={0.9} color="#bae6fd" />
      <directionalLight position={[2, 8, 2]} intensity={1.5} color="#e0f2fe" />
      <pointLight position={[0, 2, 0]} intensity={0.5} color="#38bdf8" />
      
      <primitive object={scene} position={[0, -1.4, -1.5]} scale={[1.2, 1.2, 1.2]} />

      {/* 2. UPDATED: Water Roof made a richer, deeper blue with more visibility */}
      <mesh position={[0, 3.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[50, 50]} />
        <meshBasicMaterial color="#1d4ed8" transparent opacity={0.35} side={THREE.DoubleSide} />
      </mesh>

      <mesh position={[0, 1.5, -2]} rotation={[Math.PI / 8, 0, 0]}>
        <cylinderGeometry args={[0.2, 4, 8, 32]} />
        <meshBasicMaterial color="#e0f2fe" transparent opacity={0.08} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
      </mesh>
      
      <mesh position={[-2, 1.5, -1]} rotation={[Math.PI / 6, 0, -Math.PI / 12]}>
        <cylinderGeometry args={[0.1, 2, 8, 32]} />
        <meshBasicMaterial color="#e0f2fe" transparent opacity={0.06} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function Spawner({ onSpawn }) {
  const { camera } = useThree();

  useEffect(() => {
    const interval = setInterval(() => {
      const rand = Math.random();
      let itemType;
      if (rand < 0.55) itemType = 'fish';
      else if (rand < 0.85) itemType = 'squid';
      else itemType = 'plastic';
      
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      forward.y = 0; 
      forward.normalize();

      const spawnDistance = 5.0 + Math.random() * 2.0; 
      const lateralOffset = (Math.random() - 0.5) * 3.0;

      const spawnX = camera.position.x + (forward.x * spawnDistance) - (forward.z * lateralOffset);
      const spawnZ = camera.position.z + (forward.z * spawnDistance) + (forward.x * lateralOffset);
      const spawnY = camera.position.y - 0.25 + (Math.random() - 0.5) * 1.5; 

      onSpawn({
        id: Date.now() + Math.random(),
        type: itemType,
        pos: [spawnX, spawnY, spawnZ],
        speed: 0.8 + Math.random() * 0.4
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [camera, onSpawn]);

  return null;
}

function AnimatedItem({ modelPath, scale }) {
  const { scene, animations } = useGLTF(modelPath);
  const clonedScene = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const mixer = useMemo(() => new THREE.AnimationMixer(clonedScene), [clonedScene]);

  useEffect(() => {
    if (animations && animations.length > 0) {
      mixer.clipAction(animations[0]).play().setEffectiveTimeScale(1.5); 
    }
    return () => mixer.stopAllAction();
  }, [mixer, animations]);

  useFrame((_, delta) => mixer.update(delta));
  return <primitive object={clonedScene} scale={scale} />;
}

function StaticItem({ modelPath, scale }) {
  const { scene } = useGLTF(modelPath);
  const clonedScene = useMemo(() => scene.clone(), [scene]);
  const group = useRef();
  
  useFrame((_, delta) => {
    if (group.current) {
      group.current.rotation.x += delta * 0.5;
      group.current.rotation.y += delta * 0.5;
    }
  });

  return (
    <group ref={group}>
      <primitive object={clonedScene} scale={scale} />
    </group>
  );
}

function GameItem({ id, type, startPos, speed, onCollect, onMiss }) {
  const group = useRef();
  const { camera } = useThree();

  useFrame((_, delta) => {
    if (!group.current) return;

    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion);
    forward.y = 0; 
    forward.normalize();
    group.current.position.addScaledVector(forward, speed * delta);

    const penguinPos = new THREE.Vector3(0, -0.25, -1.3).applyMatrix4(camera.matrixWorld);
    const distToPenguin = group.current.position.distanceTo(penguinPos);

    if (distToPenguin < 0.5) {
      onCollect(id, type);
    } 
    else if (group.current.position.distanceTo(camera.position) < 0.5 || group.current.position.distanceTo(penguinPos) > 10) {
      onMiss(id);
    }
  });

  return (
    <group ref={group} position={startPos}>
      {type === 'fish' && <AnimatedItem modelPath="/models/fish.glb" scale={0.05} />}
      {type === 'squid' && <AnimatedItem modelPath="/models/squid.glb" scale={0.1} />}
      {type === 'plastic' && <StaticItem modelPath="/models/plastic.glb" scale={0.05} />}
    </group>
  );
}

// 5. MAIN APP CONTAINER
export default function App() {
  const [gameState, setGameState] = useState('MENU'); 
  const [items, setItems] = useState([]);
  
  const [health, setHealth] = useState(50); 
  const [fishCount, setFishCount] = useState(0);
  const [squidCount, setSquidCount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60); 
  const [xrSession, setXrSession] = useState(null);

  const ambienceAudio = useRef(null);
  const chirpAudio = useRef(null);
  const collectAudio = useRef(null);
  // 3. UPDATED: Added error audio reference
  const errorAudio = useRef(null);

  useEffect(() => {
    ambienceAudio.current = new Audio("/audios/antarctic_ambience.mp3");
    ambienceAudio.current.loop = true;
    ambienceAudio.current.volume = 0.4;

    chirpAudio.current = new Audio("/audios/baby_penguin.mp3");
    chirpAudio.current.volume = 1.0;

    collectAudio.current = new Audio("/audios/fish_collect.mp3");
    collectAudio.current.volume = 0.8;

    errorAudio.current = new Audio("/audios/incorrect.mp3");
    errorAudio.current.volume = 0.8;

    return () => {
      if (ambienceAudio.current) ambienceAudio.current.pause();
      if (chirpAudio.current) chirpAudio.current.pause();
      if (errorAudio.current) errorAudio.current.pause();
    };
  }, []);

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

      if (xrSession) xrSession.end(); 
    }
    return () => clearInterval(timer);
  }, [gameState, timeLeft, health, xrSession]);

  const initiateXRSession = async () => {
    if (!navigator.xr) {
      setGameState('PLAYING');
      return;
    }

    if (collectAudio.current) {
      collectAudio.current.play().then(() => {
        collectAudio.current.pause();
        collectAudio.current.currentTime = 0;
      }).catch(e => console.log("Warmup blocked:", e));
    }
    // 3. UPDATED: Warm up the error audio as well
    if (errorAudio.current) {
      errorAudio.current.play().then(() => {
        errorAudio.current.pause();
        errorAudio.current.currentTime = 0;
      }).catch(e => console.log("Warmup blocked:", e));
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

      if (ambienceAudio.current) {
        ambienceAudio.current.currentTime = 0;
        ambienceAudio.current.play().catch(e => console.log("Audio blocked:", e));
      }

      session.addEventListener('end', () => {
        setXrSession(null);
        if (ambienceAudio.current) ambienceAudio.current.pause();
        setGameState(prev => prev === 'PLAYING' ? 'MENU' : prev);
      });
    } catch (e) {
      console.error("Failed to start AR Session:", e);
      setGameState('PLAYING');
    }
  };

  const handleSpawn = useCallback((newItem) => {
    setItems((prev) => [...prev, newItem]);
  }, []);

  const handleCollect = useCallback((id, type) => {
    setTimeout(() => {
      setItems((prev) => prev.filter(item => item.id !== id));

      if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(40);
      }
      
      // 3. UPDATED: Play specific audio based on collected type
      if (type === 'plastic') {
        if (errorAudio.current) {
          errorAudio.current.currentTime = 0;
          errorAudio.current.play().catch(e => console.log("Audio blocked:", e));
        }
        setHealth((h) => Math.max(0, h - 20));   
      } else {
        if (collectAudio.current) {
          collectAudio.current.currentTime = 0;
          collectAudio.current.play().catch(e => console.log("Audio blocked:", e));
        }
        if (type === 'fish') {
          setHealth((h) => Math.min(100, h + 10)); 
          setFishCount((f) => f + 1);
        } else if (type === 'squid') {
          setHealth((h) => Math.min(100, h + 20)); 
          setSquidCount((s) => s + 1);
        }
      }
    }, 0);
  }, []);

  const handleMiss = useCallback((id) => {
    setTimeout(() => {
      setItems((prev) => prev.filter(item => item.id !== id));
    }, 0);
  }, []);

  const handlePlayAgain = () => {
    window.location.reload();
  };

  const getBatteryMessage = () => {
    if (health >= 80) return "Incredible! ICY is completely full of energy! 🐧✨";
    if (health >= 40) return "Good job! ICY safely navigated the waters. 🌊🐟";
    if (health > 0) return "Phew! That was close. ICY is exhausted! 🔋📉";
    return "Oh no! Too much plastic drained ICY's energy. 💔";
  };

  return (
    <div id="xr-overlay" style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden', background: gameState === 'PLAYING' ? 'transparent' : '#0b1d3a' }}>
      
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

      {gameState === 'GAMEOVER' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', zIndex: 20, background: 'rgba(11, 29, 58, 0.95)', color: '#fff', fontFamily: 'sans-serif', padding: '20px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '42px', marginBottom: '8px', color: health <= 0 ? '#ef4444' : '#f8fafc' }}>
            {health <= 0 ? "OUT OF ENERGY!" : "TIME'S UP!"}
          </h1>
          
          <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '24px 40px', borderRadius: '12px', margin: '20px 0 30px 0', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ fontSize: '16px', color: '#94a3b8', marginBottom: '8px' }}>FINAL BATTERY LEVEL</div>
            <div style={{ fontSize: '48px', fontWeight: 'bold', color: health > 30 ? '#4ade80' : '#ef4444', marginBottom: '10px' }}>{health}%</div>
            
            <div style={{ fontSize: '15px', color: '#cbd5e1', fontStyle: 'italic', marginBottom: '16px' }}>
              "{getBatteryMessage()}"
            </div>
            
            <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', fontSize: '14px' }}>
              <span style={{ color: '#4ade80' }}>Fish: {fishCount}</span>
              <span style={{ color: '#c084fc' }}>Squid: {squidCount}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '15px' }}>
            <button onClick={handlePlayAgain} style={{ background: '#2563eb', border: 'none', color: '#fff', padding: '14px 30px', fontSize: '16px', fontWeight: 'bold', borderRadius: '8px', cursor: 'pointer', boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)' }}>
              PLAY AGAIN
            </button>
            <button onClick={() => setGameState('THANKYOU')} style={{ background: 'transparent', border: '2px solid #64748b', color: '#e2e8f0', padding: '14px 30px', fontSize: '16px', fontWeight: 'bold', borderRadius: '8px', cursor: 'pointer' }}>
              EXIT GAME
            </button>
          </div>
        </div>
      )}

      {gameState === 'THANKYOU' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', zIndex: 30, background: 'rgba(11, 29, 58, 1)', color: '#fff', fontFamily: 'sans-serif', padding: '30px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '48px', marginBottom: '15px', color: '#38bdf8' }}>Thank You!</h1>
          <p style={{ fontSize: '18px', color: '#cbd5e1', maxWidth: '450px', lineHeight: '1.6', marginBottom: '40px' }}>
            Thank you for playing ICY AR! Plastic pollution is incredibly deadly to marine life. By helping ICY safely avoid the plastic bottles, you did your part to keep our virtual oceans clean and safe.
          </p>
          <div style={{ width: '60px', height: '4px', background: '#38bdf8', borderRadius: '2px', opacity: 0.5 }}></div>
        </div>
      )}

      <Canvas camera={{ position: [0, 1.5, 0], fov: 70 }} gl={{ alpha: true }}>
        <XRManager session={xrSession} />
        
        {gameState === 'PLAYING' && (
          <>
            <Environment />
            <PlayerPenguin />
            <Bubbles />
            
            <Spawner onSpawn={handleSpawn} isActive={true} />
            
            {items.map((item) => (
              <GameItem 
                key={item.id} 
                id={item.id}
                type={item.type} 
                startPos={item.pos} 
                speed={item.speed}
                onCollect={handleCollect}
                onMiss={handleMiss}
              />
            ))}
          </>
        )}
      </Canvas>
    </div>
  );
}