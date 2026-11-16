import { PROMPT_LIBRARY_ENABLED } from "@/constant/feature-flags";
import { ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { App, Button, ConfigProvider, Image, Tag } from "antd";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { fetchPrompts, type Prompt } from "@/services/api/prompts";
import i18n from "@/i18n";
import { cn } from "@/lib/utils";
import { useThemeStore } from "@/stores/use-theme-store";
import { useConfigStore } from "@/stores/use-config-store";
import { useConnectorManagerStore } from "@/stores/use-connectors-store";
import { LocalAccountStatus } from "@/components/layout/local-account-status";

export default function IndexPage() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const theme = useThemeStore(state => state.theme);
    const heroRef = useRef<HTMLIFrameElement>(null);
    const [promptShowcase, setPromptShowcase] = useState<Prompt[]>([]);
    const [previewIndex, setPreviewIndex] = useState(0);
    const [previewOpen, setPreviewOpen] = useState(false);

    useEffect(() => {
        const onAction = (event: MessageEvent) => {
            if (event.origin !== location.origin || event.source !== heroRef.current?.contentWindow || event.data?.type !== 'canvas-home-action') return;
            if (event.data.action === 'platforms') useConnectorManagerStore.getState().openManager();
            if (event.data.action === 'accounts') useConfigStore.getState().openConfigDialog(false, 'local-cli');
            if (event.data.action === 'settings') useConfigStore.getState().openConfigDialog();
        };
        window.addEventListener('message', onAction);
        return () => window.removeEventListener('message', onAction);
    }, []);

    useEffect(() => {
        if (!PROMPT_LIBRARY_ENABLED) return;
        void fetchPrompts({ pageSize: 12 })
            .then((data) => setPromptShowcase(data.items))
            .catch((error) => message.error(error instanceof Error ? error.message : i18n.t("home.promptError")));
    }, [message]);

    return (
        <main className="relative h-full overflow-y-auto bg-background bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] text-stone-950 dark:bg-[radial-gradient(rgba(245,245,244,.18)_1px,transparent_1px)] dark:text-stone-100">
            <iframe ref={heroRef} src={`${import.meta.env.BASE_URL}cue-home-hero.html?theme=${theme}`} title={t("meta.title")} className="block h-full min-h-[420px] w-full border-0" />
            <div className="absolute inset-x-0 bottom-20 flex justify-center"><ConfigProvider theme={{ token: { colorText: '#494464' } }}><LocalAccountStatus /></ConfigProvider></div>
            <section className="relative mx-auto max-w-7xl overflow-hidden px-6">
                {PROMPT_LIBRARY_ENABLED && <section className="relative mx-auto mb-20 max-w-6xl border-t border-stone-200 pt-12 dark:border-stone-800">
                    <div className="mb-8 grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-start">
                        <div />
                        <div className="max-w-2xl text-center">
                            <h2 className="text-3xl font-semibold text-stone-950 dark:text-stone-100">{t("home.showcaseTitle")}</h2>
                            <p className="mt-3 text-base leading-7 text-stone-500 dark:text-stone-400">{t("home.showcaseDescription")}</p>
                        </div>
                        <Button type="link" onClick={() => navigate("/prompts")} className="justify-self-center md:justify-self-end" icon={<ArrowRight className="size-4" />} iconPlacement="end">
                            {t("home.viewPrompts")}
                        </Button>
                    </div>
                    <div className="grid auto-rows-[210px] gap-4 md:grid-cols-4">
                        {promptShowcase.map((item, index) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => {
                                    setPreviewIndex(index);
                                    setPreviewOpen(true);
                                }}
                                className={cn(
                                    "group relative cursor-pointer overflow-hidden border border-stone-200 bg-stone-100 text-left dark:border-stone-800 dark:bg-stone-900",
                                    index === 0 && "md:col-span-2 md:row-span-2",
                                    index === 3 && "md:col-span-2",
                                )}
                            >
                                <img src={item.coverUrl} alt={item.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
                                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/35 to-transparent p-4 text-white">
                                    <div className="mb-2 flex flex-wrap gap-1.5">
                                        {item.tags.slice(0, 2).map((tag) => (
                                            <Tag key={tag} variant="filled" className="m-0 bg-white/15 text-[11px] text-white backdrop-blur">
                                                {tag}
                                            </Tag>
                                        ))}
                                    </div>
                                    <h3 className="text-sm font-medium">{item.title}</h3>
                                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/75">{item.prompt}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                </section>}
            </section>
            {PROMPT_LIBRARY_ENABLED && <Image.PreviewGroup
                preview={{
                    open: previewOpen,
                    current: previewIndex,
                    onOpenChange: setPreviewOpen,
                    onChange: setPreviewIndex,
                }}
            >
                <div className="hidden">
                    {promptShowcase.map((item) => (
                        <Image key={item.id} src={item.coverUrl} alt={item.title} />
                    ))}
                </div>
            </Image.PreviewGroup>}
        </main>
    );
}
