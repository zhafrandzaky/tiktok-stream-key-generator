import { describe, expect, it } from "vitest"
import {
  buildQualityOptions,
  defaultQualityKey,
  obsPresetText,
  QUALITY_SPECS,
} from "@/lib/stream-quality"

const REAL_MAP = {
  AUTO: "AUTO",
  FULL_HD1: "1080p",
  HD1: "720p",
  ORIGION: "Original",
  SD1: "360p",
  SD2: "540p",
  pm_mt_video_1080p60: "1080p60",
  pm_mt_video_720p60: "720p60",
  ttlive_videoQuality_option_2k: "2K",
}

describe("buildQualityOptions", () => {
  it("orders options from TikTok's own map and marks account tiers", () => {
    const options = buildQualityOptions({
      resolutionOptions: REAL_MAP,
      candidateResolutions: ["SD1", "SD2", "HD1", "FULL_HD1"],
    })
    expect(options.map((option) => option.key)).toEqual([
      "AUTO",
      "ORIGION",
      "SD1",
      "SD2",
      "HD1",
      "FULL_HD1",
      "pm_mt_video_720p60",
      "pm_mt_video_1080p60",
      "ttlive_videoQuality_option_2k",
    ])
    const byKey = Object.fromEntries(options.map((option) => [option.key, option]))
    expect(byKey.FULL_HD1?.available).toBe(true)
    expect(byKey.pm_mt_video_1080p60?.available).toBe(false)
    expect(byKey.AUTO?.available).toBe(true)
  })

  it("computes portrait dimensions and bitrates", () => {
    const options = buildQualityOptions({ resolutionOptions: REAL_MAP })
    const byKey = Object.fromEntries(options.map((option) => [option.key, option]))
    expect(byKey.FULL_HD1).toMatchObject({ width: 1080, height: 1920, fps: 30, bitrateKbps: 6000 })
    expect(byKey.pm_mt_video_1080p60).toMatchObject({ width: 1080, height: 1920, fps: 60, bitrateKbps: 8000 })
    expect(byKey.HD1).toMatchObject({ width: 720, height: 1280, fps: 30, bitrateKbps: 4000 })
    expect(byKey.ttlive_videoQuality_option_2k).toMatchObject({ width: 1440, height: 2560 })
  })

  it("falls back to the built-in spec list when TikTok sends no map", () => {
    const options = buildQualityOptions({})
    expect(options.map((option) => option.key)).toEqual(QUALITY_SPECS.map((spec) => spec.key))
    expect(options.every((option) => option.available)).toBe(true)
  })
})

describe("defaultQualityKey", () => {
  it("prefers AUTO and falls back to the first option", () => {
    expect(defaultQualityKey(buildQualityOptions({ resolutionOptions: REAL_MAP }))).toBe("AUTO")
    expect(defaultQualityKey(buildQualityOptions({ resolutionOptions: { HD1: "720p" } }))).toBe("HD1")
  })
})

describe("obsPresetText", () => {
  it("renders a copyable OBS preset", () => {
    const options = buildQualityOptions({ resolutionOptions: REAL_MAP })
    const option = options.find((entry) => entry.key === "pm_mt_video_1080p60")
    expect(option && obsPresetText(option)).toBe("1080 × 1920 (portrait) · 60 fps · 8000 kbps CBR · keyframe 1s")
  })
})
