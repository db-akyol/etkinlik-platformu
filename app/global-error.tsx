"use client";

import { useEffect } from "react";

// This replaces the ROOT layout when IT throws, so it renders its own
// <html>/<body> and can't assume app/layout.tsx's fonts, globals.css or the
// (public) header exist — Tailwind classes may not have loaded at all.
// Inline styles keep this legible regardless of what else broke.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="tr">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          padding: "24px",
          textAlign: "center",
          backgroundColor: "#fafafa",
          color: "#171717",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
        }}
      >
        <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>Bir şeyler ters gitti</h1>
        <p style={{ maxWidth: "360px", fontSize: "14px", color: "#52525b", margin: 0 }}>
          Uygulama beklenmeyen bir hatayla karşılaştı. Tekrar denemek
          sorunu çözebilir.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: "8px",
            borderRadius: "9999px",
            border: "none",
            backgroundColor: "#0f6e78",
            color: "#ffffff",
            fontSize: "14px",
            fontWeight: 500,
            padding: "8px 20px",
            cursor: "pointer",
          }}
        >
          Tekrar dene
        </button>
        {error.digest && (
          <p
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: "12px",
              color: "#a1a1aa",
              margin: 0,
            }}
          >
            {error.digest}
          </p>
        )}
      </body>
    </html>
  );
}
