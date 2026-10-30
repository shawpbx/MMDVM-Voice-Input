export type DigitalMode = 'DMR' | 'DStar' | 'YSF' | 'P25' | 'NXDN' | 'POCSAG' | 'FM' | 'M17';

export type AlertTriggerType =
  | 'modem_connect'
  | 'modem_disconnect'
  | 'mode_change'
  | 'rf_rx_start'
  | 'rf_rx_end'
  | 'net_rx_start'
  | 'net_rx_end'
  | 'high_ber'
  | 'high_temp'
  | 'network_lost'
  | 'hourly_id'
  | 'cw_id'
  | 'timeout_warning';

export interface AlertRule {
  id: AlertTriggerType;
  label: string;
  category: 'system' | 'traffic' | 'alarm' | 'beacon';
  enabled: boolean;
  voiceTemplate: string;
  playRogerBeep: boolean;
  beepType?: RogerBeepType;
  priority: 'low' | 'normal' | 'high' | 'critical';
  cooldownSeconds: number;
  lastTriggered?: number;
}

export type RogerBeepType =
  | 'motorola_classic'
  | 'kenwood_courtesy'
  | 'nasa_quindar'
  | 'pistar_chime'
  | 'dual_tone_burst'
  | 'soft_chirp'
  | 'none';

export interface AudioDevice {
  deviceId: string;
  label: string;
  groupId: string;
  kind: MediaDeviceKind;
}

export interface AudioSettings {
  selectedDeviceId: string;
  volume: number; // 0.0 - 1.0
  radioFilterEnabled: boolean; // 300Hz - 3200Hz ham radio bandpass
  squelchTailEnabled: boolean; // radio squelch burst at end
  squelchTailDurationMs: number;
  micClickEnabled: boolean; // PTT keyup/keydown click
  speechRate: number; // 0.8 - 1.5
  speechPitch: number; // 0.5 - 1.5
  phoneticCallsigns: boolean; // W1AW -> Whiskey One Alpha Whiskey
  selectedVoiceURI: string;
  cwSpeedWpm: number; // 12 - 25
  cwToneHz: number; // 600 - 900
}

export interface MmdvmLogEntry {
  id: string;
  timestamp: string;
  level: 'I' | 'M' | 'W' | 'E' | 'D'; // Info, Message, Warning, Error, Debug
  mode?: DigitalMode;
  source: 'RF' | 'NET' | 'MODEM' | 'SYS';
  callsign?: string;
  target?: string; // e.g. TG 91, Room 21080
  duration?: number;
  ber?: number;
  message: string;
}

export interface MmdvmStatus {
  connected: boolean;
  port: string;
  baudRate: number;
  activeMode: DigitalMode | 'IDLE';
  txState: 'IDLE' | 'RX_RF' | 'RX_NET' | 'TX';
  currentCallsign?: string;
  currentTarget?: string;
  currentBer: number;
  temperatureC: number;
  rxFrequency: string;
  txFrequency: string;
  repeaterCallsign: string;
  dmrId: string;
  connectedAudioDeviceName: string;
}

export type DmrTimeSlot = 1 | 2;
export type DmrCallType = 'group' | 'private';
export type DmrAudioSourceType = 'mic' | 'tts' | 'audio_file' | 'tone' | 'soundboard';
export type DmrInjectionState = 'idle' | 'transmitting' | 'playback_echo' | 'finishing';

export interface DmrTargetTalkgroup {
  tgId: number;
  name: string;
  defaultSlot: DmrTimeSlot;
  description: string;
  category: 'worldwide' | 'national' | 'regional' | 'tactical' | 'test' | 'custom';
  isEcho?: boolean;
}

export interface DmrTxMetrics {
  framesSent: number;
  durationSeconds: number;
  currentRssi: number; // e.g. -68 dBm
  currentBer: number; // e.g. 0.1%
  targetTG: number;
  timeSlot: DmrTimeSlot;
  callType: DmrCallType;
  sourceCallsign: string;
  sourceDmrId: string;
  audioPeakDb: number; // -60 to 0 dBFS
  isClipping: boolean;
}

export interface DmrPresetBulletin {
  id: string;
  title: string;
  category: string;
  description: string;
  text: string;
  toneType?: string;
  durationSec?: number;
}

