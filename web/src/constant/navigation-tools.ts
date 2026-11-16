import { PROMPT_LIBRARY_ENABLED } from "@/constant/feature-flags";
import { FileText, ImagePlus, Images, Maximize2, Settings2, Video } from "lucide-react";

const allNavigationTools = [
    {
        slug: "canvas",
        icon: Maximize2,
    },
    {
        slug: "image",
        icon: ImagePlus,
    },
    {
        slug: "video",
        icon: Video,
    },
    {
        slug: "prompts",
        icon: FileText,
    },
    {
        slug: "assets",
        icon: Images,
    },
    {
        slug: "config",
        icon: Settings2,
    },
] as const;

export const navigationTools = allNavigationTools.filter((tool) => PROMPT_LIBRARY_ENABLED || tool.slug !== "prompts");

export type NavigationToolSlug = (typeof navigationTools)[number]["slug"];
