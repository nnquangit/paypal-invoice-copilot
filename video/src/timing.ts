/** Scene order + Remotion frame budgets (30 fps). VO starts after a short visual lead-in. */
export const FPS = 30;
export const VO_LEAD_FRAMES = 18; // 0.6s

export const SCENES = [
  {
    id: "title",
    component: "Title",
    durationInFrames: 270,
    vo: "audio/vo-01-title.mp3",
    captionKey: "01-title" as const,
  },
  {
    id: "problem",
    component: "Problem",
    durationInFrames: 330,
    vo: "audio/vo-02-problem.mp3",
    captionKey: "02-problem" as const,
  },
  {
    id: "solution",
    component: "Solution",
    durationInFrames: 330,
    vo: "audio/vo-03-solution.mp3",
    captionKey: "03-solution" as const,
  },
  {
    id: "flow",
    component: "Flow",
    durationInFrames: 360,
    vo: "audio/vo-04-flow.mp3",
    captionKey: "04-flow" as const,
  },
  {
    id: "stack",
    component: "Stack",
    durationInFrames: 330,
    vo: "audio/vo-05-stack.mp3",
    captionKey: "05-stack" as const,
  },
  {
    id: "outro",
    component: "Outro",
    durationInFrames: 330,
    vo: "audio/vo-06-outro.mp3",
    captionKey: "06-outro" as const,
  },
] as const;

export const TOTAL_FRAMES = SCENES.reduce((n, s) => n + s.durationInFrames, 0);

export const BG_MUSIC = "audio/bg-ambient.mp3";
/** ~−20 dB vs voice at 1.0 */
export const BG_VOLUME = 0.45;
export const VO_VOLUME = 1;
