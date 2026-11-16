# AI Creation Canvas — project and design ideas

[中文](brief.zh-CN.md) · [Local setup](README.md)

Hi Alok, thanks for being open to taking a look! Here is some context about the project and the design problems I am running into. I would love to hear your thoughts, and hopefully there is a component idea here that interests you too.

## What I am building

I am adapting [infinite-canvas](https://github.com/basketikun/infinite-canvas) into a local AI creation tool for myself and a few friends, mainly for image and video generation.

We use GPT, Gemini, Kling, Jimeng and RunningHub. The idea is to keep references, prompts, generation and results in one canvas, so we spend less time switching websites, uploading the same images and copying or downloading things.

A typical session looks like:

**Add references → write a prompt → generate a few candidates → choose one to refine or turn into a video → review and organize the results on the canvas.**

There is also a chat assistant alongside the canvas for discussing ideas, analyzing selected images and improving prompts.

## The direction I like

[Lovart's canvas](https://www.lovart.ai/canvas) is the overall experience I have wanted to get closer to. It is my main design reference. [LibTV](https://www.liblib.tv/canvas) is another reference for the image/video creation workflow.

A few Cue components also caught my eye:

- **Image Generation Job Card** — the way it communicates generation status.
- **AI Chat Card With Reply** — the conversation and quoted-reply interaction.
- **Made For Cue Hero Preloader** — the opening experience; for this project, an “Open canvas” button would fit the entry point.

I like these interactions and would love to find a way for them to feel at home in the canvas.

## Where I am struggling

Individual components look good, but when I put them together, the whole interface feels inconsistent. Typography, spacing, buttons, panels and animations do not share a clear direction. The canvas, assistant and settings can feel like separate products.

The main creation screen is where I would most appreciate some guidance. I want the artwork to be the focus, with references, prompts, model selection and generation easy to reach. Opening the assistant or a settings panel should still leave the workspace clear and comfortable.

Two other pain points are making generation/error states understandable and giving the connection settings a clearer hierarchy.

## A few possible starting points

Any of these would be helpful, depending on what interests you and how much time you have:

- A quick look at the full canvas, with suggestions for layout, typography, spacing and visual consistency.
- An image/video creation panel that brings references, the prompt, model selection and generation together.
- A generation-status card or chat-assistant component example that feels cohesive with the canvas.

If one of these sounds interesting, we can figure out a small scope together. A layout sketch, interaction suggestion or component example would all help me move forward. I can keep working on the code integration and the rest of the app.

## A little functional context

- Images: text-to-image, editing with multiple references, candidates and previous versions.
- Videos: text-to-video, image-to-video and first/last frames, with playback and result selection inside the node.
- Connections: pass an image as a reference to another node; generation starts when the user clicks.
- Results: candidates/history stay in the original node; one is selected as the current output and can be extracted into a separate node.
- Assistant: chat, selected-image analysis and prompt suggestions that the user chooses to apply to a node.

For now, I am focusing on the image/video and creative-chat experience. More detailed functionality is documented in the repository if it becomes useful to discuss.
