import { clamp } from "../../../shared/format";
import type { LoopRange } from "../../../shared/types";
/** 区间最小长度（秒）：小区间也要能快速连续地循环 */
export const MIN_LOOP = 1;
/** 循环跨界跳转的等待上限（毫秒）：超过则暂停循环，等待用户决定 */
export const LOOP_WAIT_LIMIT = 3000;
/** 区间端点吸附步进（秒） */
export const LOOP_STEP = 0.1;
function round(time: number) {
  return Math.round(time * 10) / 10;
}
/** 排序、夹取到章节内，并保证最小长度 */
export function clampRange(range: LoopRange, duration: number): LoopRange {
  let start = clamp(Math.min(range.start, range.end), 0, duration);
  let end = clamp(Math.max(range.start, range.end), 0, duration);
  if (end - start < MIN_LOOP) {
    end = Math.min(duration, start + MIN_LOOP);
    start = Math.max(0, end - MIN_LOOP);
  }
  return { start: round(start), end: round(end) };
}
export function inRange(range: LoopRange, time: number) {
  return time >= range.start && time <= range.end;
}
/**
 * 区间被缩到当前播放位置以外时的接续目标：
 * 越过终点等价于循环回起点，未到起点则前接至起点；在区间内返回 null。
 */
export function continuationTarget(
  range: LoopRange,
  time: number,
): number | null {
  return inRange(range, time) ? null : range.start;
}
/** 播放头触及区间终点的判定余量（秒） */
export const WRAP_EPSILON = 0.04;
export function reachedEnd(range: LoopRange, time: number) {
  return time >= range.end - WRAP_EPSILON;
}
