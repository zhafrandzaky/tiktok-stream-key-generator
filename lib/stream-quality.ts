export type QualitySpec = {
  key: string
  label: string
  shortSide: number
  fps: number
  bitrateKbps: number
}

export type Orientation = "portrait" | "landscape"

export type QualityOption = QualitySpec & {
  available: boolean
  orientation: Orientation
  width: number
  height: number
}

export const QUALITY_SPECS: QualitySpec[] = [
  { key: "AUTO", label: "Auto", shortSide: 1080, fps: 60, bitrateKbps: 6000 },
  { key: "ORIGION", label: "Original", shortSide: 1080, fps: 60, bitrateKbps: 6000 },
  { key: "SD1", label: "360p", shortSide: 360, fps: 30, bitrateKbps: 1200 },
  { key: "SD2", label: "540p", shortSide: 540, fps: 30, bitrateKbps: 2500 },
  { key: "HD1", label: "720p", shortSide: 720, fps: 30, bitrateKbps: 4000 },
  { key: "FULL_HD1", label: "1080p", shortSide: 1080, fps: 30, bitrateKbps: 6000 },
  { key: "pm_mt_video_720p60", label: "720p60", shortSide: 720, fps: 60, bitrateKbps: 4500 },
  { key: "pm_mt_video_1080p60", label: "1080p60", shortSide: 1080, fps: 60, bitrateKbps: 8000 },
  { key: "ttlive_videoQuality_option_2k", label: "2K", shortSide: 1440, fps: 30, bitrateKbps: 10000 },
]

function specFor(key: string, label?: string): QualitySpec {
  const known = QUALITY_SPECS.find((spec) => spec.key === key)
  if (known) return known
  return { key, label: label ?? key, shortSide: 1080, fps: 30, bitrateKbps: 6000 }
}

export function buildQualityOptions(input: {
  resolutionOptions?: Record<string, string>
  candidateResolutions?: string[]
  orientation?: Orientation
}): QualityOption[] {
  const orientation = input.orientation ?? "portrait"
  const names = input.resolutionOptions ?? {}
  const candidates = new Set(input.candidateResolutions ?? [])
  const keys = Object.keys(names).length > 0 ? Object.keys(names) : QUALITY_SPECS.map((spec) => spec.key)
  const orderedKeys = [
    ...QUALITY_SPECS.map((spec) => spec.key).filter((key) => keys.includes(key)),
    ...keys.filter((key) => !QUALITY_SPECS.some((spec) => spec.key === key)),
  ]

  return orderedKeys.map((key) => {
    const spec = specFor(key, names[key])
    const longSide = Math.round((spec.shortSide * 16) / 9)
    const width = orientation === "portrait" ? spec.shortSide : longSide
    const height = orientation === "portrait" ? longSide : spec.shortSide
    return {
      ...spec,
      available: candidates.size === 0 || candidates.has(key) || key === "AUTO" || key === "ORIGION",
      orientation,
      width,
      height,
    }
  })
}

export function defaultQualityKey(options: QualityOption[]): string {
  return options.find((option) => option.key === "AUTO")?.key ?? options[0]?.key ?? "AUTO"
}

export function obsPresetText(option: QualityOption): string {
  return `${option.width} × ${option.height} (${option.orientation}) · ${option.fps} fps · ${option.bitrateKbps} kbps CBR · keyframe 1s`
}
