import { computed, ref, watch } from "vue";
import { hotspots } from "../../../shared/content";
import { activeHotspots } from "../lib/visibility";
import type { Hotspot } from "../../../shared/types";
export function createDiscovery(
  position: () => { chapterId: string; time: number },
) {
  const enabled = ref(true),
    selected = ref<string | null>(null),
    /** 已首次发现的热点：循环跨界、回访都不再重复提示 */
    discovered = ref(new Set<string>()),
    notice = ref<Hotspot | null>(null);
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;
  const visible = computed(() => {
    const p = position();
    return activeHotspots(hotspots, p.chapterId, p.time);
  });
  const detail = computed(() => hotspots.find((h) => h.id === selected.value));
  watch(
    visible,
    (items) => {
      if (!enabled.value) return;
      const fresh = items.filter((h) => !discovered.value.has(h.id));
      if (!fresh.length) return;
      discovered.value = new Set([...discovered.value, ...fresh.map((h) => h.id)]);
      notice.value = fresh[0]!;
      clearTimeout(noticeTimer);
      noticeTimer = setTimeout(() => (notice.value = null), 3600);
    },
    { immediate: true },
  );
  return {
    enabled,
    selected,
    visible,
    detail,
    notice,
    select: (id: string) => {
      if (hotspots.some((h) => h.id === id)) selected.value = id;
    },
    close: () => (selected.value = null),
  };
}
