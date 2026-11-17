import { ref } from "vue";
import { createCamera } from "../features/panorama";
import { createPlayback, createLoop } from "../features/chapters";
import { createDiscovery } from "../features/hotspots";
import { createBranch } from "../features/interviews";
import { createJournal } from "../features/journal";
import { inRange } from "../features/chapters/lib/loop";
import type { Command, Position } from "../shared/types";
export function createWorkspace() {
  const camera = createCamera(),
    playback = createPlayback(),
    loop = createLoop(playback),
    discovery = createDiscovery(() => playback.state),
    branch = createBranch(),
    journal = createJournal(),
    tab = ref("story");
  const position = (): Position => ({
    chapterId: playback.state.chapterId,
    time: playback.state.time,
    camera: { ...camera.camera },
    playing: playback.state.playing,
  });
  function enterPerson(id: string) {
    branch.enter(id, position());
    playback.state.playing = false;
    discovery.close();
  }
  function dispatch(command: Command) {
    switch (command.type) {
      case "chapter":
        if (branch.personId.value) return;
        loop.deactivate();
        playback.select(command.id);
        camera.reset();
        discovery.close();
        break;
      case "seek":
        playback.seek(command.time);
        break;
      case "hotspot":
        discovery.select(command.id);
        break;
      case "return": {
        const saved = branch.leave();
        if (saved) {
          playback.select(saved.chapterId);
          playback.seek(saved.time);
          camera.restore(saved.camera);
          playback.state.playing = saved.playing;
        }
        break;
      }
      case "revisit":
        branch.leave();
        loop.deactivate();
        playback.select(command.entry.chapterId);
        playback.seek(command.entry.time);
        camera.restore(command.entry.camera);
        discovery.select(command.entry.hotspotId);
        if (command.restoreLoop && command.entry.loop)
          loop.restore(command.entry.chapterId, command.entry.loop);
        tab.value = "story";
        break;
    }
  }
  function save() {
    const h = discovery.detail.value,
      r = loop.range.value;
    if (h)
      journal.save(
        h,
        position(),
        loop.state.active && r && inRange(r, playback.state.time)
          ? r
          : undefined,
      );
  }
  return {
    camera,
    playback,
    loop,
    discovery,
    branch,
    journal,
    tab,
    position,
    enterPerson,
    dispatch,
    save,
  };
}
