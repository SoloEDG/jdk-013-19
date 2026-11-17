<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import type { Playback } from "../model/playback";
import type { Loop } from "../model/loop";
import { LOOP_WAIT_LIMIT, reachedEnd } from "../lib/loop";
const props = defineProps<{ playback: Playback; loop: Loop; branch: boolean }>();
const video = ref<HTMLVideoElement>();
function sync() {
  const v = video.value;
  if (!v) return;
  v.muted = props.playback.state.muted;
  v.playbackRate = props.playback.state.rate;
  if (Math.abs(v.currentTime - props.playback.state.time) > 0.4)
    v.currentTime = props.playback.state.time;
  if (props.playback.state.playing && !props.branch) {
    if (v.paused)
      v.play().catch(() => {
        props.playback.state.playing = false;
        props.playback.state.error = "请点击播放以继续";
      });
  } else v.pause();
}
/** 循环是否正在驱动当前播放（每帧复核，切章/暂停/进访谈即失效） */
function looping() {
  return (
    props.playback.state.playing &&
    !props.branch &&
    props.loop.state.active &&
    !!props.loop.range.value
  );
}
let raf = 0,
  pendingSince = 0;
function wrap(v: HTMLVideoElement, start: number) {
  props.loop.beginWrap();
  pendingSince = performance.now();
  v.currentTime = start;
  props.playback.tick(start);
}
/** 循环推进：rAF 与 timeupdate 共用，保证后台标签页也能连续循环 */
function pump(v: HTMLVideoElement) {
  const range = props.loop.range.value;
  if (!range || !looping() || props.playback.state.scrubbing) return;
  const status = props.loop.state.status;
  if (status === "stalled") props.loop.retry();
  else if (status === "pending") {
    if (
      !v.seeking &&
      range.start - 0.3 <= v.currentTime &&
      v.currentTime < range.end
    )
      props.loop.resolveWrap();
    else if (performance.now() - pendingSince > LOOP_WAIT_LIMIT) {
      props.loop.stallWrap();
      props.playback.state.playing = false;
    }
  } else {
    props.playback.tick(v.currentTime);
    if (reachedEnd(range, v.currentTime)) wrap(v, range.start);
  }
}
function engine() {
  raf = 0;
  const v = video.value;
  if (!v || !looping()) return;
  pump(v);
  if (looping()) raf = requestAnimationFrame(engine);
}
function onTimeupdate(e: Event) {
  if (props.branch || !props.playback.state.playing) return;
  const v = e.target as HTMLVideoElement;
  if (props.loop.state.active && props.loop.range.value) pump(v);
  else props.playback.tick(v.currentTime);
}
function onEnded() {
  const range = props.loop.range.value,
    v = video.value;
  if (
    v &&
    range &&
    props.loop.state.active &&
    !props.branch &&
    range.end >= props.playback.chapter.value.duration - 0.1
  ) {
    wrap(v, range.start);
    v.play().catch(() => {
      props.playback.state.playing = false;
    });
    if (!raf) raf = requestAnimationFrame(engine);
  } else props.playback.finish();
}
onMounted(sync);
watch(
  () => [
    props.playback.state.playing,
    props.playback.state.time,
    props.playback.state.muted,
    props.playback.state.rate,
    props.branch,
  ],
  sync,
);
watch(
  () => [
    props.playback.state.playing,
    props.playback.state.chapterId,
    props.loop.state.active,
    props.branch,
  ],
  () => {
    if (looping()) {
      if (!raf) raf = requestAnimationFrame(engine);
    } else {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      props.loop.resolveWrap();
    }
  },
);
onUnmounted(() => {
  if (raf) cancelAnimationFrame(raf);
});
</script>
<template>
  <video
    ref="video"
    class="film-texture"
    :src="playback.chapter.value.video"
    playsinline
    :muted="playback.state.muted"
    preload="auto"
    @loadedmetadata="
      playback.state.ready = true;
      sync();
    "
    @timeupdate="onTimeupdate"
    @ended="onEnded"
    @error="playback.state.error = '影像加载失败，请刷新重试'"
  />
  <div v-if="playback.state.error" role="status" class="media-warning">
    {{ playback.state.error }}
  </div>
</template>
