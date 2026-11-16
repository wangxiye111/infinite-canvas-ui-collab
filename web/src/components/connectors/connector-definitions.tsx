import { Plug } from "lucide-react";

import { ConnectorTaskNode } from "@/components/connectors/connector-task-node";
import type { CanvasNodeDefinition } from "@/types/canvas-plugin";

export const connectorNodeDefinitions: CanvasNodeDefinition[] = [
    {
        type: "connectors:task",
        title: "平台任务",
        description: "选择已保存的平台预设，接入文本、图片和视频，生成后导入画布",
        icon: <Plug className="size-4" />,
        defaultSize: { width: 390, height: 450 },
        defaultMetadata: { connector: {} },
        hidePanel: true,
        Content: ConnectorTaskNode,
    },
];
