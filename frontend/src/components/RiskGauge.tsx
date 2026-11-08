"use client";

import { useEffect, useRef } from "react";

interface Props {
  score: number;
  size?: number;
}

export default function RiskGauge({ score, size = 160 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const currentRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const center = size / 2;
    const radius = size / 2 - 14;
    const startAngle = 0.75 * Math.PI;
    const endAngle = 2.25 * Math.PI;
    const totalArc = endAngle - startAngle;

    let startTime: number | null = null;
    const duration = 1400;

    function getColor(s: number): string {
      if (s < 30) return "#2a9d8f";
      if (s < 60) return "#f4a261";
      if (s < 80) return "#e76f51";
      return "#e63946";
    }

    function draw(timestamp: number) {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      currentRef.current = eased * score;

      const c = ctx!;
      c.clearRect(0, 0, size, size);

      // Background arc
      c.beginPath();
      c.arc(center, center, radius, startAngle, endAngle);
      c.strokeStyle = "rgba(255,255,255,0.05)";
      c.lineWidth = 12;
      c.lineCap = "round";
      c.stroke();

      // Value arc
      const valueAngle = startAngle + totalArc * (currentRef.current / 100);
      const color = getColor(score);

      c.beginPath();
      c.arc(center, center, radius, startAngle, valueAngle);
      c.strokeStyle = color;
      c.lineWidth = 12;
      c.lineCap = "round";
      c.stroke();

      // Outer glow
      c.beginPath();
      c.arc(center, center, radius + 4, startAngle, valueAngle);
      c.strokeStyle = color.replace(")", ",0.15)").replace("rgb", "rgba");
      c.lineWidth = 20;
      c.stroke();

      // Inner glow
      c.beginPath();
      c.arc(center, center, radius - 4, startAngle, valueAngle);
      c.strokeStyle = color.replace(")", ",0.08)").replace("rgb", "rgba");
      c.lineWidth = 8;
      c.stroke();

      // Center value
      c.fillStyle = color;
      c.font = `bold ${size * 0.18}px "Outfit", sans-serif`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(Math.round(currentRef.current).toString(), center, center - 6);

      c.fillStyle = "rgba(255,255,255,0.5)";
      c.font = "11px \"Outfit\", sans-serif";
      c.fillText("RISK", center, center + 18);

      if (progress < 1) {
        animRef.current = requestAnimationFrame(draw);
      }
    }

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [score, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className="risk-gauge-canvas block"
    />
  );
}