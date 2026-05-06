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

declare module "https://app.realeye.io/sdk/js/testRunnerEmbeddableSdk-1.10.0.js" {
  export default class EmbeddedPageSdk {
    constructor(
      debugMode?: boolean,
      stimulusId?: string | null,
      forceRun?: boolean,
      deferInitialExposure?: boolean
    );

    startNextExposure(): void;
    finishEyeTrackingTest(): void;
    finishEntireStudy(): void;
    enableVirtualChin(b: boolean): void;
    setStimulusId(id: string | null): void;
    getStimulusId(): string;
  }
}