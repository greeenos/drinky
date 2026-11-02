export enum NotificationType {
  Notification = "NOTIFICATION",
  Popup = "POPUP",
}

export interface WorkingHoursRange {
  fromMinutes: number;
  toMinutes: number;
}

export interface WorkingHours {
  enabled: boolean;
  ranges: WorkingHoursRange[];
}

export enum SoundType {
  None = "NONE",
  Gong = "GONG",
  Blip = "BLIP",
  Bloop = "BLOOP",
  Ping = "PING",
  Scifi = "SCIFI",
}

export enum TrayTextMode {
  TimeToNextBreak = "TIME_TO_NEXT_BREAK",
  TimeSinceLastBreak = "TIME_SINCE_LAST_BREAK",
}

export interface Settings {
  autoLaunch: boolean;
  breaksEnabled: boolean;
  trayTextEnabled: boolean;
  trayTextMode: TrayTextMode;
  notificationType: NotificationType;
  breakFrequencySeconds: number;
  breakLengthSeconds: number;
  postponeLengthSeconds: number;
  postponeLimit: number;
  workingHoursEnabled: boolean;
  workingHoursMonday: WorkingHours;
  workingHoursTuesday: WorkingHours;
  workingHoursWednesday: WorkingHours;
  workingHoursThursday: WorkingHours;
  workingHoursFriday: WorkingHours;
  workingHoursSaturday: WorkingHours;
  workingHoursSunday: WorkingHours;
  idleResetEnabled: boolean;
  idleResetLengthSeconds: number;
  idleResetNotification: boolean;
  soundType: SoundType;
  breakSoundVolume: number;
  breakTitle: string;
  breakMessage: string;
  backgroundColor: string;
  textColor: string;
  showBackdrop: boolean;
  backdropOpacity: number;
  endBreakEnabled: boolean;
  skipBreakEnabled: boolean;
  postponeBreakEnabled: boolean;
  immediatelyStartBreaks: boolean;
  glassMl: number;
  dailyGoalMl: number;
  serverUrl: string;
}

export const defaultWorkingRange: WorkingHoursRange = {
  fromMinutes: 9 * 60, // 09:00
  toMinutes: 18 * 60, // 18:00
};

export const defaultSettings: Settings = {
  autoLaunch: true,
  breaksEnabled: true,
  trayTextEnabled: true,
  trayTextMode: TrayTextMode.TimeToNextBreak,
  notificationType: NotificationType.Popup,
  breakFrequencySeconds: 105 * 60, // 9h workday / 5 glasses
  breakLengthSeconds: 30,
  postponeLengthSeconds: 5 * 60,
  postponeLimit: 0,
  workingHoursEnabled: true,
  workingHoursMonday: {
    enabled: true,
    ranges: [defaultWorkingRange],
  },
  workingHoursTuesday: {
    enabled: true,
    ranges: [defaultWorkingRange],
  },
  workingHoursWednesday: {
    enabled: true,
    ranges: [defaultWorkingRange],
  },
  workingHoursThursday: {
    enabled: true,
    ranges: [defaultWorkingRange],
  },
  workingHoursFriday: {
    enabled: true,
    ranges: [defaultWorkingRange],
  },
  workingHoursSaturday: {
    enabled: false,
    ranges: [defaultWorkingRange],
  },
  workingHoursSunday: {
    enabled: false,
    ranges: [defaultWorkingRange],
  },
  idleResetEnabled: true,
  idleResetLengthSeconds: 5 * 60,
  idleResetNotification: false,
  soundType: SoundType.Bloop,
  breakSoundVolume: 1,
  breakTitle: "Time to drink 💧",
  breakMessage: "Grab your glass and drink it up.",
  backgroundColor: "#0284c7",
  textColor: "#ffffff",
  showBackdrop: true,
  backdropOpacity: 0.7,
  endBreakEnabled: true,
  skipBreakEnabled: true,
  postponeBreakEnabled: true,
  immediatelyStartBreaks: false,
  glassMl: 400,
  dailyGoalMl: 2000,
  serverUrl: "",
};

export interface DayConfig {
  key:
    | "workingHoursMonday"
    | "workingHoursTuesday"
    | "workingHoursWednesday"
    | "workingHoursThursday"
    | "workingHoursFriday"
    | "workingHoursSaturday"
    | "workingHoursSunday";
  label: string;
}

export const daysConfig: DayConfig[] = [
  { key: "workingHoursMonday", label: "Monday" },
  { key: "workingHoursTuesday", label: "Tuesday" },
  { key: "workingHoursWednesday", label: "Wednesday" },
  { key: "workingHoursThursday", label: "Thursday" },
  { key: "workingHoursFriday", label: "Friday" },
  { key: "workingHoursSaturday", label: "Saturday" },
  { key: "workingHoursSunday", label: "Sunday" },
];
