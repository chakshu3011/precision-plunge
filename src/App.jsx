import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, useAnimations, OrbitControls } from "@react-three/drei";
import { useRef, useEffect, useState, Suspense } from "react";
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
// 1. TRUE FLOATING MARINE ENVIRONMENT
// ==========================================
function Environment({ isInAR }) {
  return (
    <group>
      {/* Sandy Floor - Only visible on desktop simulator mode to keep AR clean */}
      {!isInAR && (
        <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[30, 30]} />
          <meshStandardMaterial color="#d4b296" roughness={0.9} />
        </mesh>
      )}
      <ambientLight intensity={1.5} />
      <directionalLight position={[5, 10, 5]} intensity={1.2} />
    </group>
  );
}

// ==========================================
// 2. SEA-FLOOR PENGUIN (LOCKED TO TRUE GROUND)
// ==========================================
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

    // Track position 1.2 meters in front of phone view, locked safely to y = 0 (true floor)
    const targetPosition = new THREE.Vector3(0, 0, -1.2); 
    targetPosition.applyMatrix4(camera.matrixWorld);
    targetPosition.y = 0; // Absolute ground level tracking alignment

    group.current.position.lerp(targetPosition, delta * 5);

    // Turn penguin to face where the camera is looking
    const lookTarget = new THREE.Vector3(camera.position.x, 0, camera.position.z);
    group.current.lookAt(lookTarget);
  });

  return (
    <group ref={group} position={[0, 0, 0]}>
      {/* Balanced scale step down to fit comfortably in your room view */}
      <primitive object={penguin.scene} scale={0.15} />
    </group>
  );
}

// ==========================================
// 3. ROBUST ITEM SPAWNER (NO AUTO-COLLIDE)
// ==========================================
function Spawner({ onCollectFish, onCollectSquid, onHitPlastic }) {
  const [items, setItems] = useState([]);
  const { camera } = useThree();

  useEffect(() => {
    if (!camera) return;

    const interval = setInterval(() => {
      const rand = Math.random();
      let itemType = "fish";
      if (rand > 0.6 && rand <= 0.85) itemType = "squid";
      if (rand > 0.85) itemType = "plastic";

      // Enforce clean spawn radius minimum 4 meters out so they never overlap instantly
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      forward.y = 0; // Flatten trajectory vector
      forward.normalize();

      const spawnDistance = 4.5 + Math.random() * 2.0;
      const lateralOffset = (Math.random() - 0.5) * 2.5;

      const spawnX = camera.position.x + (forward.x * spawnDistance) - (forward.z * lateralOffset);
      const spawnZ = camera.position.z + (forward.z * spawnDistance) + (forward.x * lateralOffset);
      const spawnY = 0.1 + Math.random() * 0.4; // Swim slightly above your real carpet floor

      setItems((prev) => [
        ...prev,
        {
          id: Date.now() + Math.random(),
          type: itemType,
          pos: [spawnX, spawnY, spawnZ],
          speed: 1.0 + Math.random() * 0.6
        }
      ]);
    }, 2500);

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

        // Advance objects along floor tracking line toward player position
        const direction = new THREE.Vector3().subVectors(targetVec, itemVec).normalize();
        itemVec.addScaledVector(direction, item.speed * delta);
        item.pos = [itemVec.x, itemVec.y, itemVec.z];

        const distance = itemVec.distanceTo(penguinFloorPos);

        // Safe hit registration bounds check
        if (distance < 0.45) {
          if (item.type === "fish") onCollectFish();
          if (item.type === "squid") onCollectSquid();
          if (item.type === "plastic") onHitPlastic();
        } else {
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
              <coneGeometry args={[0.08, 0.25, 4]} rotation={[Math.PI / 2, 0, 0]} />
              <meshStandardMaterial color="#4ade80" emissive="#22c55e" roughness={0.2} />
            </mesh>
          )}
          {item.type === "squid" && (
            <mesh>
              <cylinderGeometry args={[0.06, 0.06, 0.25, 6]} />
              <meshStandardMaterial color="#c084fc" emissive="#a855f7" roughness={0.2} />
            </mesh>
          )}
          {item.type === "plastic" && (
            <mesh>
              <boxGeometry args={[0.15, 0.15, 0.15]} />
              <meshStandardMaterial color="#f87171" emissive="#ef4444" roughness={0.5} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}

// ==========================================
// 4. MAIN USER SYSTEM & ARCHITECTURE
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
      console.warn("WebXR missing. Activating Desktop Simulator Loop.");
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
        // CRITICAL BUG FIX: Swaps to transparent background style during active play 
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

      {/* THREE.JS GRAPHICS VIEWPORT Container */}
      <Canvas 
        style={{ width: "100%", height: "100%" }} 
        camera={{ position: [0, 1.4, 2.0], fov: 65 }}
        gl={{ alpha: true }} // Allows device camera video matrix layer to show through canvas viewport
      >
        <XRManager session={xrSession} />
        <Suspense fallback={null}>
          <Environment isInAR={!!xrSession} />
          <PlayerPenguin />
          <Spawner 
            onCollectFish={() => { setFishCount((c) => c + 1); setScore((s) => s + 1); }}
            onCollectSquid={() => { setSquidCount((c) => c + 1); setScore((s) => s + 2); }}
            onHitPlastic={() => { setScore((s) => Math.max(0, s - 2)); }}
          />
        </Suspense>

        {/* Desktop Browser Fallback Interface Controls */}
        {!xrSession && <OrbitControls maxPolarAngle={Math.PI / 2 - 0.05} />}
      </Canvas>
    </div>
  );
}