import { computed, reactive } from "vue";
import type { LoopRange } from "../../../shared/types";
import { timecode } from "../../../shared/format";
import { clampRange, continuationTarget } from "../lib/loop";
import type { Playback } from "./playback";
export type LoopStatus = "idle" | "pending" | "stalled";
export function createLoop(playback: Playback) {
  const state = reactive({
    /** 每章各自记住的复看区间 */
    ranges: {} as Record<string, LoopRange>,
    /** 当前章是否正在循环复看 */
    active: false,
    /** 标记中的区间起点（等待终点） */
    mark: null as number | null,
    /** 跨界跳转状态：等待接续 / 超时已暂停 */
    status: "idle" as LoopStatus,
    /** 接续行为提示（自动消退） */
    notice: "",
  });
  const range = computed(() => state.ranges[playback.state.chapterId]);
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;
  function flash(text: string) {
    state.notice = text;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => (state.notice = ""), 2600);
  }
  function cancelWait() {
    if (state.status !== "idle") state.status = "idle";
  }
  /** 区间缩到播放位置以外时，接续到区间起点并明示 */
  function continueIfOutside(next: LoopRange) {
    const target = continuationTarget(next, playback.state.time);
    if (target != null) {
      playback.seek(target);
      flash(`已接续到区间起点 ${timecode(target)}`);
    }
  }
  function setRange(chapterId: string, value: LoopRange) {
    const duration =
      chapterId === playback.state.chapterId
        ? playback.chapter.value.duration
        : Math.max(value.end, value.start);
    state.ranges[chapterId] = clampRange(value, duration);
  }
  return {
    state,
    range,
    /** 标记区间起点（当前播放位置） */
    markStart() {
      state.mark = playback.state.time;
    },
    cancelMark() {
      state.mark = null;
    },
    /** 标记区间终点并立即开始复看 */
    markEnd() {
      if (state.mark == null) return;
      const next = clampRange(
        { start: state.mark, end: playback.state.time },
        playback.chapter.value.duration,
      );
      state.ranges[playback.state.chapterId] = next;
      state.mark = null;
      state.active = true;
      cancelWait();
      continueIfOutside(next);
      flash(`复看区间 ${timecode(next.start)} – ${timecode(next.end)} 循环中`);
    },
    /** 拖动区间端点（可边播放边调整） */
    adjust(edge: "start" | "end", time: number) {
      const current = range.value;
      if (!current) return;
      const next = clampRange(
        edge === "start"
          ? { start: time, end: current.end }
          : { start: current.start, end: time },
        playback.chapter.value.duration,
      );
      state.ranges[playback.state.chapterId] = next;
      if (state.active) continueIfOutside(next);
    },
    toggle() {
      const current = range.value;
      if (!current) return;
      state.active = !state.active;
      cancelWait();
      if (state.active) continueIfOutside(current);
    },
    clear() {
      delete state.ranges[playback.state.chapterId];
      state.active = false;
      state.notice = "";
      cancelWait();
    },
    /** 手动切章：旧循环立即失效，不再发出任何定位 */
    deactivate() {
      state.active = false;
      state.mark = null;
      state.notice = "";
      cancelWait();
    },
    /** 手记回访：恢复指定章的区间并开启循环 */
    restore(chapterId: string, value: LoopRange) {
      setRange(chapterId, value);
      state.active = true;
      cancelWait();
      const current = state.ranges[chapterId];
      if (current) continueIfOutside(current);
    },
    /** 循环引擎：跨界跳转开始等待 */
    beginWrap() {
      state.status = "pending";
    },
    /** 循环引擎：跳转已完成 */
    resolveWrap() {
      if (state.status === "pending") state.status = "idle";
    },
    /** 循环引擎：等待超过边界，暂停循环（active 保留，待用户恢复） */
    stallWrap() {
      if (state.status === "pending") state.status = "stalled";
    },
    /** 用户重新播放后清除超时状态，允许重试 */
    retry() {
      if (state.status === "stalled") state.status = "idle";
    },
  };
}
export type Loop = ReturnType<typeof createLoop>;
