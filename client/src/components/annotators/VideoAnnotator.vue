<script lang="ts">
import { defineComponent, PropType } from '@vue/composition-api';
import useMediaController from './useMediaController';

/**
 * For MPEG codecs, the PTS (Presentation Timestamp)
 * should be forced ahead 1 tick. currentTime has a finite
 * resolution of 90MHZ
 *
 * Chrome has a PTS precision bug:
 * https://bugs.chromium.org/p/chromium/issues/detail?id=555376
 * "currentTime must be in the range [PTS, PTS + duration)",
 * but Chrome behaves as if currentTime in = [PTS, PTS + duration]
 *
 * Firefox behaves correctly, so it's harmless to advance a single
 * tick into the already correct PTS.
 *
 * Other browsers can be wrong by more than an entire frame and are
 * futile to attempt to correct.
 *
 * TODO: VideoAnnotator _should_not_ report this PTS force hack
 * when reporting currentTime, as it would be inaccurate re: the
 * MPEG specification.
 */
const OnePTSTick = 1 / (90 * 1000);

export default defineComponent({
  name: 'VideoAnnotator',

  props: {
    videoUrl: {
      type: String,
      required: true,
    },
    videoPlayerAttributes: {
      type: Object as PropType<{ [key: string]: string }>,
      default: () => ({}),
    },
    frameRate: {
      type: Number,
      required: true,
    },
  },

  setup(props, { emit }) {
    const commonMedia = useMediaController({ emit });
    const { data } = commonMedia;

    function makeVideo() {
      const video = document.createElement('video');
      video.preload = 'auto';
      video.src = props.videoUrl;
      Object.assign(video, props.videoPlayerAttributes);
      return video;
    }
    const video = makeVideo();

    function syncWithVideo() {
      if (data.playing) {
        data.frame = Math.round(video.currentTime * props.frameRate);
        data.syncedFrame = data.frame;
        commonMedia.geoViewerRef.value.scheduleAnimationFrame(syncWithVideo);
      }
    }

    async function play() {
      try {
        await video.play();
        data.playing = true;
        syncWithVideo();
      } catch (ex) {
        console.error(ex);
      }
    }

    async function seek(frame: number) {
      // ref: PTS precision note above
      video.currentTime = (frame / props.frameRate) + OnePTSTick;
      data.frame = Math.round(video.currentTime * props.frameRate);
      commonMedia.emitFrame();
    }

    function pause() {
      video.pause();
      seek(data.frame); // snap to frame boundary
      data.playing = false;
    }

    const {
      cursorHandler,
      initializeViewer,
      mediaController,
    } = commonMedia.initialize({ seek, play, pause });

    /**
     * Initialize the Quad feature layer once
     * video metadata has been fetched.
     */
    function loadedMetadata() {
      video.removeEventListener('loadedmetadata', loadedMetadata);
      const width = video.videoWidth;
      const height = video.videoHeight;
      data.maxFrame = props.frameRate * video.duration;
      initializeViewer(width, height);
      const quadFeatureLayer = commonMedia.geoViewerRef.value.createLayer('feature', {
        features: ['quad.video'],
      });
      quadFeatureLayer
        .createFeature('quad')
        .data([
          {
            ul: { x: 0, y: 0 },
            lr: { x: width, y: height },
            video,
          },
        ])
        .draw();
      // Force the first frame to load on slow networks.
      // See https://github.com/Kitware/dive/issues/447 for more details.
      seek(0);
      data.ready = true;
    }

    function pendingUpdate() {
      data.syncedFrame = Math.round(video.currentTime * props.frameRate);
    }

    video.addEventListener('loadedmetadata', loadedMetadata);
    video.addEventListener('seeked', pendingUpdate);

    return {
      data,
      imageCursorRef: commonMedia.imageCursorRef,
      containerRef: commonMedia.containerRef,
      onResize: commonMedia.onResize,
      cursorHandler,
      mediaController,
    };
  },
});
</script>

<template>
  <div
    v-resize="onResize"
    class="video-annotator"
    :style="{ cursor: data.cursor }"
  >
    <div
      ref="imageCursorRef"
      class="imageCursor"
    >
      <v-icon> {{ data.imageCursor }} </v-icon>
    </div>
    <div
      ref="containerRef"
      class="playback-container"
      @mousemove="cursorHandler.handleMouseMove"
      @mouseleave="cursorHandler.handleMouseLeave"
      @mouseover="cursorHandler.handleMouseEnter"
    />
    <slot name="control" />
    <slot v-if="data.ready" />
  </div>
</template>

<style lang="scss" scoped>
@import "./annotator.scss";
</style>
