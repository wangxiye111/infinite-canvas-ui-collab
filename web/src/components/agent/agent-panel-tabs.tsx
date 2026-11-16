import type { ReactNode } from "react";
import { Tooltip } from "antd";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";

export function AgentPanelTabs<T extends string>({ value, items, theme, leading, right, onChange }: { value: T; items: { value: T; label: string; icon?: ReactNode; count?: number }[]; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; leading?: ReactNode; right?: ReactNode; onChange: (value: T) => void }) {
    const { t } = useTranslation();
    return (
        <div className="@container cue-chat-tabs px-4">
            <div className="flex items-center gap-1">
                {leading ? <div className="flex shrink-0 items-center">{leading}</div> : null}
                <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-sm" role="tablist" aria-label={t("agent.panel.content")}>
                    {items.map((item) => (
                        <Tooltip key={item.value} title={`${item.label}${item.count ? ` ${item.count}` : ""}`} placement="bottom">
                            <button type="button" role="tab" aria-label={`${item.label}${item.count ? ` ${item.count}` : ""}`} aria-selected={value === item.value} className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs transition" style={{ color: value === item.value ? theme.node.text : theme.node.muted }} onClick={() => onChange(item.value)}>
                                {item.icon ? <span className="agent-panel-tab-icon">{item.icon}</span> : null}
                                <span>{item.label}</span>
                                {item.count ? <span className="text-[10px] font-normal leading-none tabular-nums opacity-60">{item.count > 99 ? "99+" : item.count}</span> : null}
                            </button>
                        </Tooltip>
                    ))}
                </nav>
                {right ? <div className="flex shrink-0 items-center gap-1">{right}</div> : null}
            </div>
        </div>
    );
}
