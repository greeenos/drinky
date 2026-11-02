import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect, useMemo, useState } from "react";
import { Settings } from "../../types/settings";
import { toast } from "../toaster";
import SettingsCard from "./settings/settings-card";
import TimeInput from "./settings/time-input";
import WorkingHoursSettings from "./settings/working-hours";
import WelcomeModal from "./welcome-modal";

export default function SettingsEl() {
  const [settingsDraft, setSettingsDraft] = useState<Settings | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);

  useEffect(() => {
    (async () => {
      const settings = (await ipcRenderer.invokeGetSettings()) as Settings;
      setSettingsDraft(settings);
      setSettings(settings);
      setShowWelcomeModal(!(await ipcRenderer.invokeGetAppInitialized()));
    })();
  }, []);

  const dirty = useMemo(
    () => JSON.stringify(settingsDraft) !== JSON.stringify(settings),
    [settings, settingsDraft],
  );

  if (settings === null || settingsDraft === null) {
    return null;
  }

  const set = <K extends keyof Settings>(field: K, value: Settings[K]) =>
    setSettingsDraft({ ...settingsDraft, [field]: value });

  const handleSave = async () => {
    await ipcRenderer.invokeSetSettings(settingsDraft);
    toast("Settings saved");
    setSettings(settingsDraft);
  };

  const enabled = settingsDraft.breaksEnabled;
  const synced = settings.serverUrl.trim() !== "";

  return (
    <div className="h-screen w-full flex flex-col bg-background">
      <nav className="flex items-center justify-between p-4 h-16 min-h-16 border-b border-border">
        <h1 className="text-2xl font-bold">💧 Drinky</h1>
        {dirty && <Button onClick={handleSave}>Save</Button>}
      </nav>
      <div className="flex-1 overflow-auto p-6 min-h-0 space-y-6">
        <SettingsCard
          title="Sync server"
          helperText="Optional. With a server, every device shows the reminder at the same time and shares today's progress."
        >
          <Input
            placeholder="https://your-server:10453"
            value={settingsDraft.serverUrl}
            onChange={(e) => set("serverUrl", e.target.value)}
          />
          {synced && (
            <p className="text-sm text-muted-foreground mt-3">
              Glass size, goal and schedule are managed on the{" "}
              <a
                href={settings.serverUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline"
              >
                server page
              </a>
              .
            </p>
          )}
        </SettingsCard>

        {!synced && (
          <>
            <SettingsCard
              title="Drinks"
              toggle={{
                checked: enabled,
                onCheckedChange: (checked) => set("breaksEnabled", checked),
              }}
            >
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Glass size (ml)</Label>
                  <Input
                    type="number"
                    min={50}
                    step={50}
                    value={settingsDraft.glassMl}
                    onChange={(e) =>
                      set("glassMl", Math.max(1, Number(e.target.value)))
                    }
                    disabled={!enabled}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Daily goal (ml)</Label>
                  <Input
                    type="number"
                    min={100}
                    step={100}
                    value={settingsDraft.dailyGoalMl}
                    onChange={(e) =>
                      set("dailyGoalMl", Math.max(1, Number(e.target.value)))
                    }
                    disabled={!enabled}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Remind every</Label>
                  <TimeInput
                    value={settingsDraft.breakFrequencySeconds}
                    onChange={(seconds) =>
                      set("breakFrequencySeconds", Math.max(60, seconds))
                    }
                    disabled={!enabled}
                  />
                </div>
              </div>
              <p className="text-sm text-muted-foreground mt-3">
                {Math.ceil(settingsDraft.dailyGoalMl / settingsDraft.glassMl)}{" "}
                glasses a day
              </p>
            </SettingsCard>

            <SettingsCard
              title="Working hours"
              helperText="Only remind during these hours."
              toggle={{
                checked: settingsDraft.workingHoursEnabled,
                onCheckedChange: (checked) =>
                  set("workingHoursEnabled", checked),
                disabled: !enabled,
              }}
            >
              <WorkingHoursSettings
                settingsDraft={settingsDraft}
                setSettingsDraft={setSettingsDraft}
              />
            </SettingsCard>
          </>
        )}
      </div>
      <WelcomeModal
        open={showWelcomeModal}
        onClose={() => setShowWelcomeModal(false)}
      />
    </div>
  );
}
