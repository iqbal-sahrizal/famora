import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: release } = await supabase
      .from("app_releases")
      .select(
        "platform, latest_version, version_code, minimum_supported_version_code, download_url, release_notes, file_size, sha256, published_at, enabled"
      )
      .eq("platform", "android")
      .eq("enabled", true)
      .order("version_code", { ascending: false })
      .limit(1)
      .maybeSingle<{
        platform: "android";
        latest_version: string;
        version_code: number;
        minimum_supported_version_code: number;
        download_url: string;
        release_notes: string[];
        file_size: number;
        sha256: string;
        published_at: string;
        enabled: boolean;
      }>();

    if (!release) {
      return NextResponse.json(
        {
          success: true,
          platform: "android",
          latestVersion: "1.0.0",
          versionCode: 0,
          minimumSupportedVersionCode: 0,
          downloadUrl: "",
          releaseNotes: [],
          fileSize: 0,
          sha256: "",
          publishedAt: new Date(0).toISOString(),
          enabled: false,
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      {
        success: true,
        platform: release.platform,
        latestVersion: release.latest_version,
        versionCode: release.version_code,
        minimumSupportedVersionCode: release.minimum_supported_version_code,
        downloadUrl: release.download_url,
        releaseNotes: Array.isArray(release.release_notes) ? release.release_notes : [],
        fileSize: Number(release.file_size),
        sha256: release.sha256,
        publishedAt: release.published_at,
        enabled: release.enabled,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { success: false, platform: "android", enabled: false, error: "Unable to load release manifest" },
      { status: 500 }
    );
  }
}
