import { ref, Ref, computed } from '@vue/composition-api';
import IntervalTree from '@flatten-js/interval-tree';
import Track, { TrackId } from '../track';

interface UseTrackStoreParams {
  markChangesPending: (
    {
      action,
      data,
    }:
    {
      action: 'upsert' | 'delete';
      data: Track;
    }) => void;
}

export function getTrack(
  trackMap: Readonly<Map<TrackId, Track>>, trackId: Readonly<TrackId>,
): Track {
  const track = trackMap.get(trackId);
  if (track === undefined) {
    throw new Error(`TrackId ${trackId} not found in trackMap.`);
  }
  return track;
}

/**
 * TrackStore performs operations on a collection of tracks, such as
 * add and remove.  Operations on individual tracks, such as setting
 * and deleting detections, should be performed directly on the track
 * object.  Trackstore will observe these changes and react if necessary.
 */
export default function useTrackStore({ markChangesPending }: UseTrackStoreParams) {
  /* Non-reactive state
   *
   * TrackMap is provided for lookup by computed functions and templates.
   * Note that a track class instance must NEVER be returned in its entirety by
   * a computed function.
   */
  const trackMap = new Map<TrackId, Track>();
  const intervalTree = new IntervalTree();

  /* Reactive state
   *
   * trackIds is a list of ID keys into trackMap.  Used to watch for add and remove
   * events that change the quantity of tracks
   *
   * canary is updated whenever a track being watched changes.  Used to watch for
   * update events on existing tracks.  If your computed function relies on a property
   * of a track, it must depend() on the canary.
   */
  const trackIds: Ref<Array<TrackId>> = ref([]);
  const canary = ref(0);

  function _depend(): number {
    return canary.value;
  }

  function getNewTrackId() {
    return trackIds.value.length
      ? Math.max(...trackIds.value) + 1
      : 0;
  }

  function onChange(
    { track, event, oldValue }:
    { track: Track; event: string; oldValue: unknown },
  ): void {
    if (event === 'bounds') {
      const oldInterval = oldValue as [number, number];
      intervalTree.remove(oldInterval, track.trackId.toString());
      intervalTree.insert([track.begin, track.end], track.trackId.toString());
    }
    canary.value += 1;
    markChangesPending({ action: 'upsert', data: track });
  }

  function insertTrack(track: Track, afterId?: TrackId) {
    track.bus.$on('notify', onChange);
    trackMap.set(track.trackId, track);
    intervalTree.insert([track.begin, track.end], track.trackId.toString());
    if (afterId) {
      /* Insert specifically after another trackId */
      const insertIndex = trackIds.value.indexOf(afterId) + 1;
      trackIds.value.splice(insertIndex, 0, track.trackId);
    } else {
      trackIds.value.push(track.trackId);
    }
  }

  function addTrack(frame: number, defaultType: string, afterId?: TrackId): Track {
    const track = new Track(getNewTrackId(), {
      begin: frame,
      end: frame,
      confidencePairs: [[defaultType, 1]],
    });
    insertTrack(track, afterId);
    markChangesPending({ action: 'upsert', data: track });
    return track;
  }

  function removeTrack(trackId: TrackId | null): void {
    if (trackId === null) {
      return;
    }
    const track = getTrack(trackMap, trackId);
    const range = [track.begin, track.end];
    if (!intervalTree.remove(range, trackId.toString())) {
      throw new Error(`TrackId ${trackId} with range ${range} not found in tree.`);
    }
    track.bus.$off(); // remove all event listeners
    trackMap.delete(trackId);
    const listIndex = trackIds.value.findIndex((v) => v === trackId);
    if (listIndex === -1) {
      throw new Error(`TrackId ${trackId} not found in trackIds.`);
    }
    trackIds.value.splice(listIndex, 1);
    markChangesPending({ action: 'delete', data: track });
  }

  /*
   * Discard tracks whose highest confidencePair value
   * is lower than specified.
   */
  async function removeTracksBelowConfidence(thresh: number) {
    trackIds.value.forEach((trackId) => {
      const track = getTrack(trackMap, trackId);
      const confidence = track.getType();
      if (confidence[1] < thresh) {
        removeTrack(trackId);
      }
    });
  }

  const sortedTracks = computed(() => {
    _depend();
    return trackIds.value
      .map((trackId) => getTrack(trackMap, trackId))
      .sort((a, b) => a.begin - b.begin);
  });

  return {
    trackMap,
    sortedTracks,
    intervalTree,
    addTrack,
    insertTrack,
    getNewTrackId,
    removeTrack,
    removeTracksBelowConfidence,
  };
}
