<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  RotateCcw,
  Repeat,
  Flag,
  X,
} from "lucide-vue-next";
import { clamp, timecode } from "../../../shared/format";
import { chapterProgress } from "../lib/timeline";
import { LOOP_WAIT_LIMIT, MIN_LOOP } from "../lib/loop";
import type { Playback } from "../model/playback";
import type { Loop } from "../model/loop";
const props = defineProps<{
  playback: Playback;
  loop: Loop;
  disabled: boolean;
}>();
defineEmits<{ reset: []; fullscreen: [] }>();
const track = ref<HTMLElement>();
const duration = computed(() => props.playback.chapter.value.duration);
const range = computed(() => props.loop.range.value);
const pct = (time: number) => `${(clamp(time, 0, duration.value) / duration.value) * 100}%`;
let edge: "start" | "end" | null = null,
  scrub = false;
function timeAt(e: PointerEvent) {
  const rect = track.value!.getBoundingClientRect();
  return clamp(
    ((e.clientX - rect.left) / rect.width) * duration.value,
    0,
    duration.value,
  );
}
function down(e: PointerEvent) {
  if (props.disabled) return;
  scrub = true;
  props.playback.state.scrubbing = true;
  track.value!.setPointerCapture(e.pointerId);
  props.playback.seek(timeAt(e));
}
function handleDown(e: PointerEvent, which: "start" | "end") {
  if (props.disabled) return;
  e.stopPropagation();
  edge = which;
  track.value!.setPointerCapture(e.pointerId);
}
function move(e: PointerEvent) {
  if (edge) props.loop.adjust(edge, timeAt(e));
  else if (scrub) props.playback.seek(timeAt(e));
}
function up() {
  scrub = false;
  edge = null;
  props.playback.state.scrubbing = false;
}
onUnmounted(up);
function seekKey(e: KeyboardEvent) {
  if (props.disabled) return;
  const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
  if (delta) {
    e.preventDefault();
    props.playback.seek(props.playback.state.time + delta);
  }
}
function edgeKey(e: KeyboardEvent, which: "start" | "end") {
  const current = range.value;
  if (!current) return;
  const delta = e.key === "ArrowRight" ? 0.5 : e.key === "ArrowLeft" ? -0.5 : 0;
  if (delta) {
    e.preventDefault();
    e.stopPropagation();
    props.loop.adjust(which, current[which] + delta);
  }
}
const statusText = computed(() => {
  const status = props.loop.state.status;
  if (status === "pending")
    return `正在接续循环…（${LOOP_WAIT_LIMIT / 1000} 秒后自动暂停）`;
  if (status === "stalled") return "跳转等待过久，已暂停循环 · 按播放重试";
  return props.loop.state.notice;
});
</script>
<template>
  <div class="transport">
    <div class="timeline-labels">
      <span>本章进度</span
      ><span
        >{{
          chapterProgress(playback.chapter.value, playback.state.time)
        }}%</span
      >
    </div>
    <div
      ref="track"
      class="timeline"
      :class="{ off: disabled }"
      role="slider"
      aria-label="播放进度"
      :aria-valuenow="Math.round(playback.state.time)"
      :aria-valuemax="Math.round(duration)"
      tabindex="0"
      @pointerdown="down"
      @pointermove="move"
      @pointerup="up"
      @pointercancel="up"
      @keydown="seekKey"
    >
      <div class="timeline-rail" />
      <div class="timeline-fill" :style="{ width: pct(playback.state.time) }" />
      <div
        v-if="range"
        class="timeline-loop"
        :class="{ on: loop.state.active }"
        :style="{
          left: pct(range.start),
          width: pct(range.end - range.start),
        }"
      />
      <div
        v-if="loop.state.mark != null"
        class="timeline-mark"
        :style="{ left: pct(loop.state.mark) }"
      />
      <div class="timeline-head" :style="{ left: pct(playback.state.time) }" />
      <button
        v-if="range"
        class="timeline-handle"
        aria-label="区间起点"
        :aria-valuenow="Math.round(range.start)"
        :style="{ left: pct(range.start) }"
        :disabled="disabled"
        @pointerdown="handleDown($event, 'start')"
        @keydown="edgeKey($event, 'start')"
        >A</button
      ><button
        v-if="range"
        class="timeline-handle"
        aria-label="区间终点"
        :aria-valuenow="Math.round(range.end)"
        :style="{ left: pct(range.end) }"
        :disabled="disabled"
        @pointerdown="handleDown($event, 'end')"
        @keydown="edgeKey($event, 'end')"
        >B</button
      >
    </div>
    <div class="loop-row">
      <template v-if="range">
        <button
          class="loop-toggle"
          :class="{ on: loop.state.active }"
          :aria-pressed="loop.state.active"
          :disabled="disabled"
          @click="loop.toggle()"
        >
          <Repeat :size="13" /> 循环复看</button
        ><span class="loop-range"
          >{{ timecode(range.start) }} – {{ timecode(range.end) }}
          <em>{{ (range.end - range.start).toFixed(1) }}s</em></span
        ><button
          class="loop-clear"
          aria-label="清除复看区间"
          :disabled="disabled"
          @click="loop.clear()"
        >
          <X :size="13" /></button
      ></template>
      <template v-else-if="loop.state.mark != null">
        <span class="loop-mark">起点 {{ timecode(loop.state.mark) }}</span
        ><button class="loop-action" :disabled="disabled" @click="loop.markEnd()">
          标记终点</button
        ><button
          class="loop-action"
          :disabled="disabled"
          @click="loop.cancelMark()"
        >
          取消</button
        >
      </template>
      <template v-else>
        <button
          class="loop-action"
          :disabled="disabled"
          @click="loop.markStart()"
        >
          <Flag :size="12" /> 标记区间起点</button
        ><span class="loop-hint"
          >划定区间反复观看，端点可拖动（最短 {{ MIN_LOOP }}s）</span
        >
      </template>
      <span v-if="statusText" class="loop-status" role="status">{{
        statusText
      }}</span>
    </div>
    <div class="controls">
      <button
        :disabled="disabled"
        :aria-label="playback.state.playing ? '暂停' : '播放'"
        @click="playback.toggle()"
      >
        <Pause v-if="playback.state.playing" /><Play v-else /></button
      ><span class="time"
        >{{ timecode(playback.state.time) }}
        <em>/ {{ timecode(playback.chapter.value.duration) }}</em></span
      ><span class="spacer" /><button
        :aria-label="playback.state.muted ? '开启声音' : '静音'"
        @click="playback.state.muted = !playback.state.muted"
      >
        <VolumeX v-if="playback.state.muted" /><Volume2 v-else /></button
      ><select aria-label="播放速度" v-model="playback.state.rate">
        <option :value="0.5">0.5×</option>
        <option :value="1">1.0×</option>
        <option :value="1.5">1.5×</option></select
      ><button aria-label="重置视角" @click="$emit('reset')">
        <RotateCcw /></button
      ><button aria-label="全屏" @click="$emit('fullscreen')">
        <Maximize />
      </button>
    </div>
  </div>
</template>
