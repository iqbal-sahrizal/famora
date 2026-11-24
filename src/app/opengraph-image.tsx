import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Senvamily — Your Family, Your World.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#F7F5EF",
          color: "#1C241F",
          fontFamily: "system-ui, sans-serif",
          padding: "64px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "112px",
            height: "112px",
            borderRadius: "28px",
            backgroundColor: "#315C49",
            marginBottom: "28px",
          }}
        >
          <svg
            width="58"
            height="58"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#F7F5EF"
            strokeWidth="1.85"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
            <path d="M12 5 9.04 7.96a2.17 2.17 0 0 0 0 3.08c.82.82 2.13.85 3 .07l2.07-1.9a2.82 2.82 0 0 1 3.79 0l2.96 2.66" />
            <path d="m18 15-2-2" />
            <path d="m15 18-2-2" />
          </svg>
        </div>
        <div
          style={{
            fontSize: "64px",
            fontWeight: 700,
            letterSpacing: "-0.03em",
            color: "#1C241F",
            marginBottom: "14px",
          }}
        >
          Senvamily
        </div>
        <div
          style={{
            fontSize: "24px",
            fontWeight: 600,
            letterSpacing: "0.08em",
            color: "#315C49",
            marginBottom: "18px",
          }}
        >
          YOUR FAMILY, YOUR WORLD.
        </div>
        <div
          style={{
            fontSize: "24px",
            color: "#556159",
            textAlign: "center",
            maxWidth: "820px",
          }}
        >
          A connected space to organize, manage, and grow together as a family.
        </div>
      </div>
    ),
    size
  );
}
