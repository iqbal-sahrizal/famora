export interface AndroidReleaseManifest {
  success: boolean;
  platform: "android";
  latestVersion: string;
  versionCode: number;
  minimumSupportedVersionCode: number;
  downloadUrl: string;
  releaseNotes: string[];
  fileSize: number;
  sha256: string;
  publishedAt: string;
  enabled: boolean;
}

export type UpdateStatus = "disabled" | "up_to_date" | "optional" | "mandatory";

export interface UpdateEvaluation {
  status: UpdateStatus;
  manifest: AndroidReleaseManifest | null;
  installedVersionCode: number;
}
