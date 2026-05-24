import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, useAnimations, OrbitControls } from "@react-three/drei";
import { useRef, useEffect, useState, Suspense, useMemo } from "react";
import * as THREE from "three";

// ==========================================
// INTERNAL NATIVE XR SESSION BINDER
// ==========================================
function XRManager({ session }) {
  const { gl } = useThree();
  useEffect(() => {
    if (session) {
      gl.xr.enabled = true;
      gl.xr.setReferenceSpaceType("local-floor");
      gl.xr.setSession(session).catch((err) => console.error("XR Bind Error:", err));
    }
  }, [session, gl]);
  return null;
}

// ==========================================
// 1. VOLUMETRIC SUN RAYS & DRIFTING BUBBLES
// ==========================================
function OceanEffects() {
  const pointsRef = useRef();
  const raysRef = useRef();

  // Create a field of 80 floating ocean particles (bubbles/plankton)
  const count = 80;
  const [positions, speeds] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const spd = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 8;       // X spread
      pos[i * 3 + 1] = Math.random() * 3;           // Y height (0 to 3m)
      pos[i * 3 + 2] = (Math.random() - 0.5) * 8;   // Z spread
      spd[i] = 0.1 + Math.random() * 0.2;           // Upward drift speed
    }
    return [pos, spd];
  }, []);

  useFrame((state, delta) => {
    // 1. Animate drifting sea particles upward
    if (pointsRef.current) {
      const geo = pointsRef.current.geometry;
      const posArr = geo.attributes.position.array;
      for (let i = 0; i < count; i++) {
        posArr[i * 3 + 1] += speeds[i] * delta; // Move up
        if (posArr[i * 3 + 1] > 3.0) {
          posArr[i * 3 + 1] = 0; // Reset back to floor level
        }
      }
      geo.attributes.position.needsUpdate = true;
    }

    // 2. Animate sun ray pulse shimmer
    if (raysRef.current) {
      raysRef.current.children.forEach((ray, index) => {
        ray.rotation.z = Math.sin(state.clock.getElapsedTime() * 0.5 + index) * 0.05;
        ray.material.opacity = 0.15 + Math.sin(state.clock.getElapsedTime() * 1.2 + index) * 0.05;
      });
    }
  });

  return (
    <group>
      {/* Drift Particles */}
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[positions, 3]}
          />
        </bufferGeometry>
          <pointsMaterial color="#7dd3fc" size={0.04} transparent opacity={0.6} sizeInverse={false} depthWrite={false} />
      </points>

      {/* Volumetric Sun Ray Shafts */}
      <group ref={raysRef} position={[0, 3.0, -2]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[(i - 1) * 1.5, -1.5, 0]} rotation={[0, 0, -0.2]}>
            <cylinderGeometry args={[0.1, 0.6, 3.5, 16, 1, true]} />
            <meshBasicMaterial
              color="#e0f2fe"
              transparent
              opacity={0.15}
              side={THREE.DoubleSide}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// ==========================================
// 2. AR-COMPATIBLE UNDERWATER LAYERS
// ==========================================
function Environment() {
  const ceilingRef = useRef();

  useFrame((state) => {
    // Create a slow wave ripple effect for the water surface
    if (ceilingRef.current) {
      ceilingRef.current.rotation.z = state.clock.getElapsedTime() * 0.02;
    }
  });

  return (
    <group>
      {/* Lighting Stack tuned for marine depth look */}
      <ambientLight intensity={0.9} color="#bae6fd" />
      <directionalLight position={[2, 8, 2]} intensity={1.5} color="#e0f2fe" />
      <pointLight position={[0, 2, 0]} intensity={0.5} color="#38bdf8" />

      {/* Ocean Floor Layer (Semi-transparent sandy overlay on your real floor) */}
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial 
          color="#1e3a8a" 
          emissive="#0f172a"
          roughness={0.9} 
          transparent 
          opacity={0.25} // Low opacity ensures your room's actual objects/floor stay visible
        />
      </mesh>

      {/* Ocean Water Ceiling Layer (Floating 3 meters above) */}
      <mesh ref={ceilingRef} position={[0, 3.0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[25, 25]} />
        <meshBasicMaterial 
          color="#0284c7" 
          transparent 
          opacity={0.35} 
          side={THREE.DoubleSide}
          wireframe={false}
        />
      </mesh>
    </group>
  );
}

// ==========================================
// 3. SEA-FLOOR PENGUIN (LOCKED TO TRUE GROUND)
// ==========================================
function PlayerPenguin() {
  const group = useRef();
  const penguin = useGLTF("/models/penguin1.glb");
  const { actions, names } = useAnimations(penguin.animations, group);
  const { camera } = useThree();

  useEffect(() => {
    if (names && names.length > 0 && actions[names[0]]) {
      actions[names[0]].reset().fadeIn(0.2).play().setEffectiveTimeScale(1.2);
    }
  }, [actions, names]);

  useFrame((_, delta) => {
    if (!group.current || !camera) return;

    // Smoothly interpolate position 1.3 meters in front of the phone screen
    const targetPosition = new THREE.Vector3(0, 0, -1.3); 
    targetPosition.applyMatrix4(camera.matrixWorld);
    targetPosition.y = 0; // Firmly lock to real floor height constraint

    group.current.position.lerp(targetPosition, delta * 5.5);

    // Keep the penguin rotated directly toward the player's real coordinates
    const lookTarget = new THREE.Vector3(camera.position.x, 0, camera.position.z);
    group.current.lookAt(lookTarget);
  });

  return (
    <group ref={group} position={[0, 0, 0]}>
      {/* Clean scale mapping for modern mobile glTF assets */}
      <primitive object={penguin.scene} scale={0.15} />
    </group>
  );
}

// ==========================================
// 4. BALANCED ITEM SPAWNER (WITH HAZARDS)
// ==========================================
function Spawner({ onCollectFish, onCollectSquid, onHitPlastic }) {
  const [items, setItems] = useState([]);
  const { camera } = useThree();

  useEffect(() => {
    if (!camera) return;

    const interval = setInterval(() => {
      const rand = Math.random();
      let itemType = "fish";
      
      // Adjusted weights: 50% Fish, 25% Squid, 25% Plastic Hazard
      if (rand > 0.50 && rand <= 0.75) itemType = "squid";
      if (rand > 0.75) itemType = "plastic";

      // Calculate vector trajectories ahead of current camera orientation
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      forward.y = 0; 
      forward.normalize();

      // Items spawn spread out further away (4.5 to 6.5 meters) so you can track them coming
      const spawnDistance = 4.5 + Math.random() * 2.0;
      const lateralOffset = (Math.random() - 0.5) * 3.5; // Wider field entry lane

      const spawnX = camera.position.x + (forward.x * spawnDistance) - (forward.z * lateralOffset);
      const spawnZ = camera.position.z + (forward.z * spawnDistance) + (forward.x * lateralOffset);
      const spawnY = 0.15 + Math.random() * 0.5; // Floating gracefully off your real floor carpet

      setItems((prev) => [
        ...prev,
        {
          id: Date.now() + Math.random(),
          type: itemType,
          pos: [spawnX, spawnY, spawnZ],
          speed: 1.1 + Math.random() * 0.5
        }
      ]);
    }, 2000); // Faster pool population stream tick rate

    return () => clearInterval(interval);
  }, [camera]);

  useFrame((_, delta) => {
    if (!camera) return;

    setItems((prevItems) => {
      let activeItems = [];
      const penguinFloorPos = new THREE.Vector3(camera.position.x, 0, camera.position.z);

      prevItems.forEach((item) => {
        const itemVec = new THREE.Vector3(...item.pos);
        const targetVec = new THREE.Vector3(camera.position.x, item.pos[1], camera.position.z);

        // Vector tracking travel calculations toward center coordinate base
        const direction = new THREE.Vector3().subVectors(targetVec, itemVec).normalize();
        itemVec.addScaledVector(direction, item.speed * delta);
        item.pos = [itemVec.x, itemVec.y, itemVec.z];

        const distance = itemVec.distanceTo(penguinFloorPos);

        // Hit Detection Box Volume
        if (distance < 0.5) {
          if (item.type === "fish") onCollectFish();
          if (item.type === "squid") onCollectSquid();
          if (item.type === "plastic") onHitPlastic();
        } else if (itemVec.distanceTo(camera.position) > 0.1) {
          // Keep item active if it hasn't completely sailed past the phone user
          activeItems.push(item);
        }
      });

      return activeItems;
    });
  });

  return (
    <group>
      {items.map((item) => (
        <group key={item.id} position={item.pos}>
          {item.type === "fish" && (
            <mesh>
              <coneGeometry args={[0.07, 0.24, 4]} rotation={[Math.PI / 2, 0, 0]} />
              <meshStandardMaterial color="#22c55e" emissive="#15803d" roughness={0.3} />
            </mesh>
          )}
          {item.type === "squid" && (
            <mesh>
              <cylinderGeometry args={[0.05, 0.05, 0.22, 6]} />
              <meshStandardMaterial color="#a855f7" emissive="#7e22ce" roughness={0.3} />
            </mesh>
          )}
          {item.type === "plastic" && (
            <mesh>
              <boxGeometry args={[0.18, 0.18, 0.18]} />
              <meshStandardMaterial color="#ef4444" emissive="#b91c1c" roughness={0.6} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}

// ==========================================
// 5. MAIN USER SYSTEM & ARCHITECTURE
// ==========================================
export default function App() {
  const [gameState, setGameState] = useState("intro"); 
  const [xrSession, setXrSession] = useState(null);
  const [fishCount, setFishCount] = useState(0);
  const [squidCount, setSquidCount] = useState(0);
  const [score, setScore] = useState(0);
  const [gameOverReason, setGameOverReason] = useState("");

  useEffect(() => {
    if (gameState !== "playing") return;
    if (fishCount >= 10) {
      triggerGameOver("WIN! Icy collected 10 Fish and is completely full! 🐧🎉");
    } else if (squidCount >= 5) {
      triggerGameOver("WIN! Icy collected 5 Squid and loves deep-sea dining! 🦑🎉");
    }
  }, [fishCount, squidCount, gameState]);

  const triggerGameOver = (reason) => {
    setGameState("gameover");
    setGameOverReason(reason);
    if (xrSession) {
      xrSession.end().catch(() => {});
      setXrSession(null);
    }
  };

  const startARGame = async () => {
    if (!navigator.xr) {
      console.warn("WebXR missing. Activating Desktop Fallback Simulator.");
      setGameState("playing");
      return;
    }
    try {
      const session = await navigator.xr.requestSession("immersive-ar", {
        requiredFeatures: ["local-floor"],
        optionalFeatures: ["dom-overlay"],
        domOverlay: { root: document.body }
      });

      setXrSession(session);
      setGameState("playing");

      session.addEventListener("end", () => {
        setGameState("intro");
        setXrSession(null);
      });
    } catch (err) {
      console.error("Critical AR Init Exception:", err);
      setGameState("playing"); 
    }
  };

  const resetGameData = () => {
    setScore(0);
    setFishCount(0);
    setSquidCount(0);
    setGameState("intro");
  };

  return (
    <div 
      style={{ 
        width: "100vw", 
        height: "100vh", 
        position: "fixed", 
        top: 0, 
        left: 0, 
        backgroundColor: gameState === "playing" ? "transparent" : "#060b14", 
        overflow: "hidden", 
        fontFamily: "sans-serif" 
      }}
    >
      
      {/* INTRO SCREEN OVERLAY */}
      {gameState === "intro" && (
        <div style={{ position: "absolute", inset: 0, backgroundColor: "#060b14", zIndex: 99999, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "30px", textAlign: "center" }}>
          <h1 style={{ color: "#ffffff", fontSize: "36px", margin: "0 0 10px 0", letterSpacing: "1px" }}>ICY AR</h1>
          <p style={{ color: "#94a3b8", fontSize: "16px", margin: "0 0 30px 0" }}>An Augmented Reality Marine Experience</p>
          
          <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", padding: "25px", borderRadius: "16px", maxWidth: "320px", marginBottom: "40px" }}>
            <h3 style={{ color: "#3b82f6", margin: "0 0 14px 0", fontSize: "18px" }}>How to Play</h3>
            <p style={{ color: "#e2e8f0", fontSize: "14px", margin: "8px 0", textAlign: "left" }}>🐟 Collect <strong style={{ color: "#4ade80" }}>10 Fish</strong> OR</p>
            <p style={{ color: "#e2e8f0", fontSize: "14px", margin: "8px 0", textAlign: "left" }}>🦑 Collect <strong style={{ color: "#c084fc" }}>5 Squid</strong> to Win!</p>
            <p style={{ color: "#f87171", fontSize: "13px", fontWeight: "bold", margin: "16px 0 0 0", textAlign: "center" }}>⚠️ AVOID RED PLASTIC BLOCKS!</p>
          </div>

          <button onClick={startARGame} style={{ width: "85%", maxWidth: "290px", padding: "18px", fontSize: "16px", fontWeight: "bold", color: "#ffffff", background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)", border: "none", borderRadius: "12px", cursor: "pointer", boxShadow: "0 8px 20px rgba(29, 78, 216, 0.3)", textTransform: "uppercase" }}>
            Start AR Game
          </button>
        </div>
      )}

      {/* GAME OVER SCREEN OVERLAY */}
      {gameState === "gameover" && (
        <div style={{ position: "absolute", inset: 0, backgroundColor: "#060b14", zIndex: 99999, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "30px", textAlign: "center" }}>
          <h2 style={{ color: "#ffffff", fontSize: "28px", margin: "0 0 20px 0" }}>Game Over</h2>
          <p style={{ color: "#e2e8f0", fontSize: "16px", maxWidth: "300px", lineHeight: "1.5", margin: "0 0 40px 0" }}>{gameOverReason}</p>
          
          <button onClick={resetGameData} style={{ width: "85%", maxWidth: "260px", padding: "16px", fontWeight: "bold", color: "#ffffff", backgroundColor: "#3b82f6", border: "none", borderRadius: "12px", cursor: "pointer" }}>
            Return to Menu
          </button>
        </div>
      )}

      {/* ACTIVE IN-GAME HUD */}
      {gameState === "playing" && (
        <div style={{ position: "absolute", top: "20px", left: "20px", right: "20px", zIndex: 9999, display: "flex", justifyContent: "space-between", pointerEvents: "none" }}>
          <div style={{ background: "rgba(6, 11, 20, 0.85)", backdropFilter: "blur(4px)", padding: "12px 16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.1)" }}>
            <p style={{ color: "#4ade80", margin: "2px 0", fontSize: "14px", fontWeight: "bold" }}>Fish: {fishCount}/10</p>
            <p style={{ color: "#c084fc", margin: "2px 0", fontSize: "14px", fontWeight: "bold" }}>Squid: {squidCount}/5</p>
          </div>
          <div style={{ background: "rgba(6, 11, 20, 0.85)", backdropFilter: "blur(4px)", padding: "12px 20px", borderRadius: "12px", display: "flex", alignItems: "center", border: "1px solid rgba(255,255,255,0.1)" }}>
            <p style={{ color: "#3b82f6", margin: 0, fontWeight: "bold", fontSize: "18px" }}>Score: {score}</p>
          </div>
        </div>
      )}

      {/* THREE.JS GRAPHICS VIEWPORT */}
      <Canvas 
        style={{ width: "100%", height: "100%" }} 
        camera={{ position: [0, 1.4, 2.0], fov: 65 }}
        gl={{ alpha: true }} 
      >
        <XRManager session={xrSession} />
        <Suspense fallback={null}>
          <Environment />
          <OceanEffects />
          <PlayerPenguin />
          <Spawner 
            onCollectFish={() => { setFishCount((c) => c + 1); setScore((s) => s + 1); }}
            onCollectSquid={() => { setSquidCount((c) => c + 1); setScore((s) => s + 2); }}
            onHitPlastic={() => { setScore((s) => Math.max(0, s - 3)); }} // Scaled up deduction penalty
          />
        </Suspense>

        {!xrSession && <OrbitControls maxPolarAngle={Math.PI / 2 - 0.05} />}
      </Canvas>
    </div>
  );
}