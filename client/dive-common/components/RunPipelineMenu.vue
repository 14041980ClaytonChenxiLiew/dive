<script lang="ts">
import {
  defineComponent, computed, PropType, ref, onBeforeMount, reactive,
} from '@vue/composition-api';
import { Pipelines, Pipe, useApi } from 'dive-common/apispec';

export default defineComponent({
  props: {
    selectedDatasetIds: {
      type: Array as PropType<string[]>,
      default: () => [],
    },
    small: {
      type: Boolean,
      default: false,
    },
  },

  setup(props) {
    const { runPipeline, getPipelineList } = useApi();
    const unsortedPipelines = ref({} as Pipelines);

    const pipelineState = reactive({
      selectedPipe: null as Pipe | null,
      status: null as 'starting' | 'done' | 'error' | null,
      error: null as null | unknown,
    });

    onBeforeMount(async () => {
      unsortedPipelines.value = await getPipelineList();
    });

    const pipelines = computed(() => {
      const sortedPipelines = {} as Pipelines;
      Object.entries(unsortedPipelines.value).forEach(([name, category]) => {
        category.pipes.sort((a, b) => {
          const aName = a.name.toLowerCase();
          const bName = b.name.toLowerCase();
          if (aName > bName) {
            return 1;
          }
          if (aName < bName) {
            return -1;
          }
          return 0;
        });
        sortedPipelines[name] = category;
      });
      return sortedPipelines;
    });

    const pipelinesNotRunnable = computed(() => (
      props.selectedDatasetIds.length < 1 || pipelines.value === null
    ));

    async function runPipelineOnSelectedItem(pipeline: Pipe) {
      if (props.selectedDatasetIds.length === 0) {
        throw new Error('No selected datasets to run on');
      }
      pipelineState.status = 'starting';
      pipelineState.selectedPipe = pipeline;
      try {
        await Promise.all(
          props.selectedDatasetIds.map((id) => runPipeline(id, pipeline)),
        );
        pipelineState.status = 'done';
      } catch (err) {
        pipelineState.status = 'error';
        pipelineState.error = err.response?.data?.message || err;
        throw err;
      }
    }

    function pipeTypeDisplay(pipeType: string) {
      switch (pipeType) {
        case 'trained':
          return 'trained';
        case 'utility':
        case 'generate':
          return 'utilities';
        default:
          return `${pipeType}s`;
      }
    }

    function dismissLaunchDialog() {
      pipelineState.selectedPipe = null;
      pipelineState.status = null;
      pipelineState.error = null;
    }

    return {
      dismissLaunchDialog,
      pipelines,
      pipelineState,
      pipelinesNotRunnable,
      pipeTypeDisplay,
      runPipelineOnSelectedItem,
    };
  },
});
</script>

<template>
  <div>
    <v-menu
      max-width="320"
      offset-y
    >
      <template v-slot:activator="{ on: menuOn }">
        <v-tooltip bottom>
          <template #activator="{ on: tooltipOn }">
            <v-btn
              text
              :small="small"
              :disabled="pipelinesNotRunnable"
              v-on="{ ...tooltipOn, ...menuOn }"
            >
              <v-icon color="accent">
                mdi-pipe
              </v-icon>
              <span
                v-show="!$vuetify.breakpoint.mdAndDown"
                class="pl-1"
              >
                Run pipeline
              </span>
            </v-btn>
          </template>
          <span>Run CV algorithm pipelines on this data</span>
        </v-tooltip>
      </template>

      <template>
        <v-card v-if="pipelines">
          <v-card-title>
            VIAME Pipelines
          </v-card-title>

          <v-card-text class="pb-0">
            Choose a pipeline type. Check the
            <a
              href="https://kitware.github.io/dive/Pipeline-Documentation/"
              target="_blank"
            >docs</a>
            for more information about these options.
          </v-card-text>
          <v-row class="px-3">
            <v-col
              v-for="(pipeType) in Object.keys(pipelines)"
              :key="pipeType"
              cols="6"
            >
              <v-menu
                :key="pipeType"
                offset-x
                right
              >
                <template v-slot:activator="{ on }">
                  <v-btn
                    depressed
                    block
                    v-on="on"
                  >
                    {{ pipeTypeDisplay(pipeType) }}
                    <v-icon
                      left
                      color="accent"
                      class="ml-0"
                    >
                      mdi-menu-right
                    </v-icon>
                  </v-btn>
                </template>

                <v-list
                  dense
                  style="overflow-y:auto; max-height:85vh"
                >
                  <v-list-item
                    v-for="(pipeline) in pipelines[pipeType].pipes"
                    :key="`${pipeline.name}-${pipeline.pipe}`"
                    @click="runPipelineOnSelectedItem(pipeline)"
                  >
                    <v-list-item-title class="font-weight-regular">
                      {{ pipeline.name }}
                    </v-list-item-title>
                  </v-list-item>
                </v-list>
              </v-menu>
            </v-col>
          </v-row>
        </v-card>
      </template>
    </v-menu>
    <v-dialog
      :value="pipelineState.status !== null"
      max-width="400"
      @input="dismissLaunchDialog"
    >
      <v-card outlined>
        <v-card-title>
          Pipeline Launch
        </v-card-title>
        <v-card-text
          class="d-flex justify-center"
        >
          <v-progress-circular
            v-if="pipelineState.status === 'starting'"
            indeterminate
            size="60"
            width="9"
            color="primary"
          />
          <v-alert
            v-if="pipelineState.status === 'error'"
            type="error"
          >
            {{ pipelineState.error }}
          </v-alert>
          <v-alert
            v-if="pipelineState.status === 'done' && pipelineState.selectedPipe"
            dense
            type="success"
          >
            Started {{ pipelineState.selectedPipe.name }}
            on {{ selectedDatasetIds.length }} dataset(s).
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            :to="{ name: 'jobs' }"
            depressed
          >
            View All Jobs
            <v-icon class="pl-1">
              mdi-format-list-checks
            </v-icon>
          </v-btn>
          <v-btn
            color="primary"
            :disabled="!(pipelineState.status !== 'starting')"
            @click="dismissLaunchDialog"
          >
            Done
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>
