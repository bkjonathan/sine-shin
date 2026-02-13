import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
} from "react";

type SoundType = "click" | "success" | "error" | "switch" | "delete";

interface SoundContextType {
  soundEnabled: boolean;
  toggleSound: () => void;
  playSound: (type: SoundType) => void;
}

const SoundContext = createContext<SoundContextType | undefined>(undefined);

const STORAGE_KEY = "sine_shin_sound_settings";

export function SoundProvider({ children }: { children: React.ReactNode }) {
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : true; // Default to true
  });

  // Keep audio context ref to avoid recreating it constantly
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(soundEnabled));
  }, [soundEnabled]);

  // Unlock AudioContext on first interaction
  useEffect(() => {
    const unlockAudio = () => {
      const AudioContextClass =
        window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass && !audioContextRef.current) {
        const ctx = new AudioContextClass();
        audioContextRef.current = ctx;
        // Try to resume immediately if created
        if (ctx.state === "suspended") {
          ctx.resume().catch(console.error);
        }
      } else if (
        audioContextRef.current &&
        audioContextRef.current.state === "suspended"
      ) {
        audioContextRef.current.resume().catch(console.error);
      }

      // Remove listeners once we've tried to unlock
      if (
        audioContextRef.current &&
        audioContextRef.current.state === "running"
      ) {
        window.removeEventListener("click", unlockAudio);
        window.removeEventListener("touchstart", unlockAudio);
        window.removeEventListener("keydown", unlockAudio);
      }
    };

    window.addEventListener("click", unlockAudio);
    window.addEventListener("touchstart", unlockAudio);
    window.addEventListener("keydown", unlockAudio);

    return () => {
      window.removeEventListener("click", unlockAudio);
      window.removeEventListener("touchstart", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, []);
  // Helper to ensure AudioContext is ready
  const ensureAudioContext = async () => {
    let ctx = audioContextRef.current;

    if (!ctx) {
      const AudioContextClass =
        window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        ctx = new AudioContextClass();
        audioContextRef.current = ctx;
      }
    }

    if (!ctx) return null;

    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch (e) {
        console.error("Failed to resume AudioContext:", e);
      }
    }
    return ctx;
  };

  const playSound = async (type: SoundType) => {
    if (!soundEnabled) return;

    try {
      const ctx = await ensureAudioContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      const now = ctx.currentTime;

      // Increased base volume for visibility (audibility)
      // Note: user system volume might be low, so we boost gain slightly
      const masterGain = 0.15;

      switch (type) {
        case "click":
          // Sharp, distinct click
          osc.type = "sine";
          osc.frequency.setValueAtTime(1200, now);
          osc.frequency.exponentialRampToValueAtTime(600, now + 0.05);

          gainNode.gain.setValueAtTime(masterGain, now);
          gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

          osc.start(now);
          osc.stop(now + 0.05);
          break;

        case "switch":
          // Clear toggle sound
          osc.type = "sine";
          osc.frequency.setValueAtTime(800, now);

          gainNode.gain.setValueAtTime(masterGain, now);
          gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

          osc.start(now);
          osc.stop(now + 0.08);
          break;

        case "success":
          // Bright positive chime
          osc.type = "triangle";
          osc.frequency.setValueAtTime(880, now); // A5
          osc.frequency.setValueAtTime(1108.73, now + 0.1); // C#6

          gainNode.gain.setValueAtTime(masterGain, now);
          gainNode.gain.linearRampToValueAtTime(masterGain, now + 0.1);
          gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

          osc.start(now);
          osc.stop(now + 0.4);
          break;

        case "error":
          // Distinct error buzz
          osc.type = "sawtooth";
          osc.frequency.setValueAtTime(220, now);
          osc.frequency.linearRampToValueAtTime(180, now + 0.2);

          gainNode.gain.setValueAtTime(masterGain, now);
          gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

          osc.start(now);
          osc.stop(now + 0.2);
          break;

        case "delete":
          // Quick negative blip
          osc.type = "square";
          osc.frequency.setValueAtTime(300, now);
          osc.frequency.exponentialRampToValueAtTime(150, now + 0.1);

          gainNode.gain.setValueAtTime(masterGain * 0.8, now);
          gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

          osc.start(now);
          osc.stop(now + 0.1);
          break;
      }
    } catch (e) {
      console.error("Audio playback error:", e);
    }
  };

  const toggleSound = () => {
    setSoundEnabled((prev) => !prev);
  };

  return (
    <SoundContext.Provider value={{ soundEnabled, toggleSound, playSound }}>
      {children}
    </SoundContext.Provider>
  );
}

export function useSound() {
  const context = useContext(SoundContext);
  if (context === undefined) {
    throw new Error("useSound must be used within a SoundProvider");
  }
  return context;
}
