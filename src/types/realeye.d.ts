// src/types/realeye.d.ts
interface Window {
  reSdk?: {
    startNextExposure: () => void;
    finishEyeTrackingTest: () => void;
    finishEntireStudy: () => void;
    enableVirtualChin: (enabled: boolean) => void;
    setStimulusId: (id: string | null) => void;
    getStimulusId: () => string;
  };
}