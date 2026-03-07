import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { getAppSettings, updateAppSettings } from "../api/appApi";

type SoundType = "click" | "success" | "error" | "switch" | "delete";

interface SoundContextType {
  soundEnabled: boolean;
  toggleSound: () => void;
  playSound: (type: SoundType) => Promise<void>;
}

const SoundContext = createContext<SoundContextType | undefined>(undefined);

export function SoundProvider({ children }: { children: React.ReactNode }) {
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  const audioContextRef = useRef<AudioContext | null>(null);
  const lastPlayedAtRef = useRef<Record<SoundType, number>>({
    click: 0,
    success: 0,
    error: 0,
    switch: 0,
    delete: 0,
  });

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const settings = await getAppSettings();
        setSoundEnabled(settings.sound_effect);
      } catch (err) {
        console.error("Failed to fetch sound settings:", err);
      }
    };

    void fetchSettings();
  }, []);

  const updateBackend = useCallback(async (enabled: boolean): Promise<void> => {
    try {
      const currentSettings = await getAppSettings();
      await updateAppSettings({ ...currentSettings, sound_effect: enabled });
    } catch (err) {
      console.error("Failed to update sound settings:", err);
    }
  }, []);

  const ensureAudioContext = useCallback(async (): Promise<AudioContext | null> => {
    let ctx = audioContextRef.current;

    if (!ctx) {
      const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
      if (AudioContextClass) {
        ctx = new AudioContextClass();
        audioContextRef.current = ctx;
      }
    }

    if (!ctx) {
      return null;
    }

    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch (err) {
        console.error("Failed to resume AudioContext:", err);
      }
    }

    return ctx;
  }, []);

  const playSound = useCallback(
    async (type: SoundType): Promise<void> => {
      if (!soundEnabled) {
        return;
      }

      const nowMs = performance.now();
      const minIntervalMs = type === "click" ? 80 : type === "switch" ? 60 : 0;
      if (minIntervalMs > 0) {
        const lastPlayedAt = lastPlayedAtRef.current[type];
        if (nowMs - lastPlayedAt < minIntervalMs) {
          return;
        }
        lastPlayedAtRef.current[type] = nowMs;
      }

      try {
        const ctx = await ensureAudioContext();
        if (!ctx) {
          return;
        }

        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();

        osc.connect(gainNode);
        gainNode.connect(ctx.destination);

        const now = ctx.currentTime;
        const masterGain = 0.15;

        switch (type) {
          case "click":
            osc.type = "sine";
            osc.frequency.setValueAtTime(1200, now);
            osc.frequency.exponentialRampToValueAtTime(600, now + 0.05);
            gainNode.gain.setValueAtTime(masterGain, now);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
            osc.start(now);
            osc.stop(now + 0.05);
            break;

          case "switch":
            osc.type = "sine";
            osc.frequency.setValueAtTime(800, now);
            gainNode.gain.setValueAtTime(masterGain, now);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
            osc.start(now);
            osc.stop(now + 0.08);
            break;

          case "success":
            osc.type = "triangle";
            osc.frequency.setValueAtTime(880, now);
            osc.frequency.setValueAtTime(1108.73, now + 0.1);
            gainNode.gain.setValueAtTime(masterGain, now);
            gainNode.gain.linearRampToValueAtTime(masterGain, now + 0.1);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
            osc.start(now);
            osc.stop(now + 0.4);
            break;

          case "error":
            osc.type = "sawtooth";
            osc.frequency.setValueAtTime(220, now);
            osc.frequency.linearRampToValueAtTime(180, now + 0.2);
            gainNode.gain.setValueAtTime(masterGain, now);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.2);
            break;

          case "delete":
            osc.type = "square";
            osc.frequency.setValueAtTime(300, now);
            osc.frequency.exponentialRampToValueAtTime(150, now + 0.1);
            gainNode.gain.setValueAtTime(masterGain * 0.8, now);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
            break;
        }
      } catch (err) {
        console.error("Audio playback error:", err);
      }
    },
    [ensureAudioContext, soundEnabled],
  );

  useEffect(() => {
    const unlockAudio = () => {
      const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
      if (AudioContextClass && !audioContextRef.current) {
        const ctx = new AudioContextClass();
        audioContextRef.current = ctx;
        if (ctx.state === "suspended") {
          void ctx.resume();
        }
      } else if (
        audioContextRef.current &&
        audioContextRef.current.state === "suspended"
      ) {
        void audioContextRef.current.resume();
      }

      if (audioContextRef.current?.state === "running") {
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

  useEffect(() => {
    const handleGlobalClick = (event: MouseEvent) => {
      if (!soundEnabled) {
        return;
      }

      const target = event.target as HTMLElement;
      const interactiveElement = target.closest(
        'button, a, [role="button"], input[type="submit"], input[type="button"], .cursor-pointer, .btn-liquid, .glass-panel',
      );

      if (interactiveElement) {
        void playSound("click");
      }
    };

    window.addEventListener("click", handleGlobalClick);
    return () => {
      window.removeEventListener("click", handleGlobalClick);
    };
  }, [playSound, soundEnabled]);

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      void updateBackend(next);
      return next;
    });
  }, [updateBackend]);

  return (
    <SoundContext.Provider value={{ soundEnabled, toggleSound, playSound }}>
      {children}
    </SoundContext.Provider>
  );
}

/**
 * Provides app-wide sound effects controls and click feedback playback.
 */
export function useSound(): SoundContextType {
  const context = useContext(SoundContext);
  if (context === undefined) {
    throw new Error("useSound must be used within a SoundProvider");
  }

  return context;
}
