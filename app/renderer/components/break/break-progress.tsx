import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { useEffect, useRef } from "react";
import { Settings, SoundType } from "../../../types/settings";
import { isPrimaryBreakWindow } from "./break-window";

interface BreakProgressProps {
  onDone: () => void;
  onSnooze: () => void;
  onSkip: () => void;
  settings: Settings;
  drinkStatus: { drankMl: number; goalMl: number; glassMl: number } | null;
}

export function BreakProgress({
  onDone,
  onSnooze,
  onSkip,
  settings,
  drinkStatus,
}: BreakProgressProps) {
  const soundPlayedRef = useRef(false);
  const color = settings.textColor;

  useEffect(() => {
    if (
      isPrimaryBreakWindow(window.location.search) &&
      settings.soundType !== SoundType.None &&
      !soundPlayedRef.current
    ) {
      soundPlayedRef.current = true;
      ipcRenderer.invokeStartSound(
        settings.soundType,
        settings.breakSoundVolume,
      );
    }
  }, [settings]);

  const button =
    "!bg-transparent hover:!bg-black/10 active:!bg-black/20 border-white/20";

  return (
    <motion.div
      className="flex flex-col w-full z-10 relative space-y-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8, delay: 0.5 }}
    >
      <h1 className="text-3xl font-semibold tracking-tight" style={{ color }}>
        {settings.breakTitle}
      </h1>
      <div
        className="text-lg opacity-80 font-medium whitespace-pre-line"
        style={{ color }}
      >
        {settings.breakMessage}
      </div>

      {drinkStatus && (
        <div className="space-y-2">
          <div className="text-5xl font-bold tabular-nums" style={{ color }}>
            {drinkStatus.glassMl} ml
          </div>
          <div className="text-sm font-medium opacity-70" style={{ color }}>
            Glass{" "}
            {Math.min(
              Math.floor(drinkStatus.drankMl / drinkStatus.glassMl) + 1,
              Math.ceil(drinkStatus.goalMl / drinkStatus.glassMl),
            )}{" "}
            of {Math.ceil(drinkStatus.goalMl / drinkStatus.glassMl)} ·{" "}
            {(drinkStatus.drankMl / 1000).toFixed(1)} /{" "}
            {(drinkStatus.goalMl / 1000).toFixed(1)} L today
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <Button
          className="flex-1 !bg-white hover:!bg-white/90 font-semibold"
          onClick={onDone}
          style={{ color: settings.backgroundColor }}
        >
          Done ✓
        </Button>
        <Button
          className={button}
          variant="outline"
          onClick={onSnooze}
          style={{ color }}
        >
          Snooze
        </Button>
        <Button
          className={button}
          variant="outline"
          onClick={onSkip}
          style={{ color }}
        >
          Skip
        </Button>
      </div>
    </motion.div>
  );
}
