// Supported public combinations read from official Dreamina CLI 1.4.22 help.
// These describe CLI support; the platform still checks the account's model entitlement.
const argument = (name, allowedValues, value) => ({ name, allowedValues, ...(value === undefined ? {} : { default: value }) });
const ratios = ["1:1", "3:4", "16:9", "4:3", "9:16", "21:9"];
export const jimengModels = Object.fromEntries(["text2image", "image2image", "text2video", "image2video", "frames2video"].map(action => {
    const image = action.endsWith("image");
    const models = image ? ["5.0", "5.0Pro"] : ["seedance2.0fast", "seedance2.0_vip", "seedance2.5"];
    return [action, models.map(model => ({ model,
        inputs: (action === "frames2video" ? ["first", "last"] : action === "image2video" ? ["image"] : action === "image2image" ? ["images"] : []).map(name => ({ name, required: true })),
        arguments: image ? [
            argument("resolution_type", model === "5.0Pro" ? ["1.5k", "2k", "4k"] : ["2k", "4k"], "2k"),
            argument("ratio", ["21:9", "16:9", "3:2", "4:3", "1:1", "3:4", "2:3", "9:16"], "16:9"),
            argument("generate_num", Array.from({ length: 10 }, (_, i) => String(i + 1)), "1"),
        ] : [
            argument("video_resolution", model === "seedance2.5" ? ["480p", "720p", "1080p"] : model === "seedance2.0_vip" ? ["720p", "1080p", "4k"] : ["720p"], "720p"),
            argument("duration", Array.from({ length: model === "seedance2.5" ? 27 : 12 }, (_, i) => String(i + 4)), "5"),
            ...(model === "seedance2.5" && action !== "text2video" ? [] : [argument("ratio", ratios, action === "text2video" ? "16:9" : undefined)]),
        ],
    }))];
}));
