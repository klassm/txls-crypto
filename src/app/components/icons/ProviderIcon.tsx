"use client";

import { ProviderType } from "@/lib/types";
import { useState, useEffect } from "react";
import { useSources } from "@/app/hooks";

interface ProviderIconProps {
  provider: ProviderType;
  width?: number;
  height?: number;
}

export function ProviderIcon({ provider, width = 24, height = 24 }: ProviderIconProps) {
  const { data: sources = [] } = useSources();
  const config = sources.find((s) => s.source === provider);
  const [svgContent, setSvgContent] = useState<string | null>(null);

  useEffect(() => {
    if (!config) return;

    fetch(config.logoPath)
      .then((response) => response.text())
      .then((svg) => {
        const colorizedSvg = svg
          .replace(/stroke:currentColor/g, `stroke:${config.logoForegroundColor}`)
          .replace(/width="[^"]*"/g, "")
          .replace(/height="[^"]*"/g, "");
        setSvgContent(colorizedSvg);
      });
  }, [config?.logoPath, config?.logoForegroundColor]);

  if (svgContent === null) {
    return null;
  }

  return (
    <div
      style={{
        display: "inline-block",
        width,
        height,
      }}
      dangerouslySetInnerHTML={{ __html: svgContent }}
    />
  );
}
