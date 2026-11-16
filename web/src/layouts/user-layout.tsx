import type { ReactNode } from "react";

import { AgentPanel } from "@/components/agent/agent-panel";
import { AppTopNav } from "@/components/layout/app-top-nav";
import { BugReporter } from "@/components/layout/bug-reporter";
import { LocalAccountStatus } from "@/components/layout/local-account-status";
import { useLocation } from "react-router-dom";

export default function UserLayout({ children }: { children: ReactNode }) {
    const { pathname } = useLocation();
    return (
        <div className="flex h-dvh overflow-hidden bg-background text-foreground">
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                <AppTopNav />
                {pathname !== "/" && !/^\/canvas\/[^/]+/.test(pathname) && <LocalAccountStatus />}
                <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
            </div>
            <AgentPanel />
            <BugReporter />
        </div>
    );
}
