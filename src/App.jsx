import "./App.css";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { XR, ARButton, useXR } from "@react-three/xr";
import { useGLTF, useAnimations } from "@react-three/drei";
import { useRef, useEffect, useState, Suspense, useMemo } from "react";
import * as THREE from "three";

// ==========================================
// 1. ENVIRONMENT: WATER ROOF & SAND FLOOR
// ==========================================
function Environment() {
  return (
    <group>
      {/* The Water Surface (Ceiling) */}
      <mesh position={[0, 2.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[20, 20]} />
        <meshBasicMaterial color="#0ea5e9" transparent opacity={0.3} side={THREE.DoubleSide} />
      </mesh>

      {/* The Ocean Floor */}
      <mesh position={[0, -1.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[10, 32]} />
        <meshStandardMaterial color="#d9b99b" />
      </mesh>

      {/* Basic God Ray (Static for now) */}
      <mesh position={[0, 1, -2]} rotation={[0.2, 0, 0]}>
        <cylinderGeometry args={[0.1, 1.5, 4, 32]} />
        <meshBasicMaterial color="#e0f2fe" transparent opacity={0.1} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

// ==========================================
// 2. PLAYER: CAMERA-TRACKED PENGUIN
// ==========================================
function PlayerPenguin() {
  const group = useRef();
  const penguin = useGLTF("/models/penguin.glb");
  const { actions, names } = useAnimations(penguin.animations, group);
  const { camera } = useThree();

  useEffect(() => {
    if (names && names.length > 0) {
      const activeAction = actions[names[0]];
      activeAction.reset().fadeIn(0.25).play();
      // Speed up animation to simulate swimming
      activeAction.setEffectiveTimeScale(1.5); 
    }
  }, [actions, names]);

  useFrame((state, delta) => {
    if (!group.current) return;
    
    // Position the penguin slightly in front and below the camera/phone
    const targetPosition = new THREE.Vector3(0, -0.2, -0.4);
    targetPosition.applyMatrix4(camera.matrixWorld);

    // Smoothly interpolate (lerp) the position for a "swimming" fluid feel
    group.current.position.lerp(targetPosition, delta * 10);
    
    // Match the camera's rotation so the penguin faces where the user looks
    group.current.quaternion.slerp(camera.quaternion, delta * 10);
  });

  return (
    <group ref={group}>
      {/* Rotate the penguin 180 degrees so its back is to the camera (user sees it swimming away) */}
      <primitive object={penguin.scene} scale={0.3} rotation={[0, Math.PI, 0]} />
    </group>
  );
}

// ==========================================
// 3. SPAWNER: INCOMING FISH
// ==========================================
function Spawner({ onScore }) {
  const [items, setItems] = useState([]);
  const { camera } = useThree();
  const fishModel = useGLTF("/models/fish.glb");

  // Spawn a new item every 2 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setItems((prev) => [
        ...prev,
        {
          id: Date.now(),
          // Spawn roughly 3 to 5 meters in front of the camera, slightly randomized
          pos: [
            camera.position.x + (Math.random() - 0.5) * 2,
            camera.position.y + (Math.random() - 0.5) * 2,
            camera.position.z - 4 - Math.random() * 2
          ]
        }
      ]);
    }, 2000);
    return () => clearInterval(interval);
  }, [camera]);

  useFrame((state, delta) => {
    setItems((prevItems) => {
      let activeItems = [];
      
      prevItems.forEach((item) => {
        // Move item towards the camera's general Z plane
        item.pos[2] += delta * 1.5; // Speed of incoming items

        const itemVec = new THREE.Vector3(...item.pos);
        const distance = camera.position.distanceTo(itemVec);

        // Collision Check (Collision radius ~0.4 meters)
        if (distance < 0.4) {
          onScore(); // Trigger score and do NOT push to activeItems (removes it)
        } 
        // Remove if it floats past the player (Z > camera.z + 1)
        else if (item.pos[2] < camera.position.z + 1) {
          activeItems.push(item);
        }
      });
      return activeItems;
    });
  });

  return (
    <group>
      {items.map((item) => (
        <primitive key={item.id} object={fishModel.scene.clone()} position={item.pos} scale={0.0015} />
      ))}
    </group>
  );
}

// ==========================================
// 4. MAIN GAME CONTROLLER
// ==========================================
export default function App() {
  const [isARActive, setIsARActive] = useState(false);
  const [score, setScore] = useState(0);

  const handleScore = () => {
    setScore((s) => s + 1);
    if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(50);
    }
  };

  useEffect(() => {
  if (navigator.xr) {
    navigator.xr.isSessionSupported('immersive-ar').then((supported) => {
      console.log("Is AR Supported:", supported);
    });
  } else {
    console.log("WebXR not found on this browser.");
  }
}, []);

  return (
    <div style={{ width: "100vw", height: "100dvh", position: "relative", backgroundColor: "#000" }}>
      
      {/* UI Overlay */}
      <div style={{ position: "absolute", zIndex: 10, width: "100%", pointerEvents: "none" }}>
        {isARActive && (
          <div style={{ padding: "20px", color: "white", fontSize: "24px", fontWeight: "bold", textShadow: "2px 2px 4px rgba(0,0,0,0.8)" }}>
            Score: {score}
          </div>
        )}
      </div>

      <ARButton
  sessionInit={{ 
    requiredFeatures: ["local-floor"],
    optionalFeatures: ["hit-test", "dom-overlay"],
    domOverlay: { root: document.body }
  }}
  // Added these styles to ensure it forces visibility
  style={{ 
    position: 'absolute', 
    bottom: '40px', 
    left: '50%', 
    transform: 'translateX(-50%)', 
    zIndex: 1000, 
    display: 'block' 
  }}
/>

      <Canvas style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}>
        <XR onSessionStart={() => setIsARActive(true)} onSessionEnd={() => setIsARActive(false)}>
          <Suspense fallback={null}>
            {isARActive && (
              <>
                <ambientLight intensity={2.0} />
                <directionalLight position={[0, 5, 0]} intensity={1.5} color="#e0f2fe" />
                <Environment />
                <PlayerPenguin />
                <Spawner onScore={handleScore} />
              </>
            )}
          </Suspense>
        </XR>
      </Canvas>
    </div>
  );
}