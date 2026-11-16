import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { Grid3X3, Sparkles } from "lucide-react";
import type { CanvasTheme } from "@/lib/canvas-theme";
import "./image-gen-card.css";

function Dots({ active }: { active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const c = cv.getContext('2d'); if (!c) return;
    const animate = active && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, W = 0, H = 0;
    const draw = (now: number) => {
      const t = animate ? now / 1000 : 0, g = 9;
      c.clearRect(0, 0, W, H); c.fillStyle = '#9d9c96';
      for (let y = g / 2; y < H; y += g) for (let x = g / 2; x < W; x += g) {
        const u = x / W, v = y / H;
        const f = Math.sin(u * 5.2 + t * .6) * Math.cos(v * 4.4 - t * .45) + Math.sin((u + v) * 7 + t * .3) * .45;
        const r = Math.max(0, (f + .9) / 2.4) * 1.35 * (1 - Math.max(0, Math.hypot(u - .5, v - .5) - .38) * 2.2);
        if (r > .18) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
      }
    };
    const size = () => { const r = cv.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1); W = r.width; H = r.height; cv.width = W * d; cv.height = H * d; c.setTransform(d, 0, 0, d, 0, 0); draw(performance.now()); };
    size(); const ro = new ResizeObserver(size); ro.observe(cv);
    const tick = (now: number) => { draw(now); raf = requestAnimationFrame(tick); };
    if (animate) raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [active]);
  return <canvas ref={ref} className="ig-dots" aria-hidden />;
}

export default function ImageGenCard({ status, active, message, provider, model, kind, theme, children }: {
    status: string;
    active: boolean;
    message?: string;
    provider?: string;
    model?: string;
    kind: "image" | "video";
    theme: CanvasTheme;
    children?: ReactNode;
}) {
    const tool = provider || "AI";
    const action = kind === "video" ? "生成视频" : "生成图片";
    return (
        <div className="ig-col cue-job-card" data-generation-card title={message || undefined} style={{
            "--cue-job-panel": theme.node.panel,
            "--cue-job-frame": theme.node.fill,
            "--cue-job-text": theme.node.text,
            "--cue-job-muted": theme.node.muted,
        } as CSSProperties}>
            <div className="ig-think"><Sparkles className={`ig-star${active ? " run" : ""}`} aria-hidden />{action}</div>
            <div className="ig-tool"><b className="lg" aria-hidden>{tool.slice(0, 1)}</b><b style={{ color: theme.node.text }}>{tool}</b></div>
            <div className="ig-meta"><span>{model || action}</span><span aria-hidden>{status}</span></div>
            <div className="ig-frame">
                {children || <Dots active={active} />}
                <span className={`ig-pill${children ? " dark" : ""}`} role="status" aria-label={message ? `${status}，${message}` : status}>
                    <Grid3X3 aria-hidden />
                    <span key={status} className="ig-swap">{status}</span>
                </span>
                {active && <span className="ig-bar" aria-hidden><i /></span>}
            </div>
        </div>
    );
}
