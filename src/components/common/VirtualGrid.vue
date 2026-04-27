<template>
  <div
    ref="container"
    class="scrollbar-thin scrollbar-track-transparent scrollbar-thumb-(--dialog-surface) h-full overflow-y-auto [overflow-anchor:none] [scrollbar-gutter:stable]"
  >
    <div :style="topSpacerStyle" />
    <div ref="gridEl" :style="mergedGridStyle">
      <div
        v-for="(item, i) in renderedItems"
        :key="item.key"
        data-virtual-grid-item
      >
        <slot name="item" :item :index="state.start + i" />
      </div>
    </div>
    <div :style="bottomSpacerStyle" />
  </div>
</template>

<script setup lang="ts" generic="T">
import { useElementSize, useScroll, whenever } from '@vueuse/core'
import { clamp, debounce } from 'es-toolkit/compat'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { CSSProperties } from 'vue'

type GridState = {
  start: number
  end: number
  isNearEnd: boolean
}

const {
  items,
  gridStyle,
  bufferRows = 1,
  scrollThrottle = 64,
  resizeDebounce = 64,
  defaultItemHeight = 200,
  defaultItemWidth = 200,
  maxColumns = Infinity
} = defineProps<{
  items: (T & { key: string })[]
  gridStyle: CSSProperties
  bufferRows?: number
  scrollThrottle?: number
  resizeDebounce?: number
  defaultItemHeight?: number
  defaultItemWidth?: number
  maxColumns?: number
}>()

const emit = defineEmits<{
  /**
   * Emitted when `bufferRows` (or fewer) rows remaining between scrollY and grid bottom.
   */
  'approach-end': []
}>()

const itemHeight = ref(defaultItemHeight)
const itemWidth = ref(defaultItemWidth)
// Measured from the grid element's computed style to account for CSS gap and padding.
// Without these, scroll offset and spacer height calculations drift by (rowGap * N) per N
// skipped rows, causing items to disappear mid-scroll as the virtual window drifts ahead.
const itemRowGap = ref(0)
const itemPaddingTop = ref(0)

const container = ref<HTMLElement | null>(null)
const gridEl = ref<HTMLElement | null>(null)
const { width, height } = useElementSize(container)
const { y: scrollY } = useScroll(container, {
  throttle: scrollThrottle,
  eventListenerOptions: { passive: true }
})

const cols = computed(() => {
  if (maxColumns !== Infinity) return maxColumns
  return Math.floor(width.value / itemWidth.value) || 1
})

const mergedGridStyle = computed<CSSProperties>(() => {
  if (maxColumns === Infinity) return gridStyle
  return {
    ...gridStyle,
    gridTemplateColumns: `repeat(${maxColumns}, minmax(0, 1fr))`
  }
})

// Effective row height includes the CSS row gap between rows.
// Row N appears at: paddingTop + N * effectiveRowHeight (verified for any gap/padding combo).
const effectiveRowHeight = computed(() =>
  Math.max(1, itemHeight.value + itemRowGap.value)
)
const viewRows = computed(() =>
  Math.ceil(height.value / effectiveRowHeight.value)
)
const offsetRows = computed(() =>
  Math.floor(
    Math.max(0, scrollY.value - itemPaddingTop.value) / effectiveRowHeight.value
  )
)
const isValidGrid = computed(() => height.value && width.value && items?.length)

const state = computed<GridState>(() => {
  const fromRow = offsetRows.value - bufferRows
  const toRow = offsetRows.value + bufferRows + viewRows.value

  const fromCol = fromRow * cols.value
  const toCol = toRow * cols.value
  const remainingCol = items.length - toCol
  const hasMoreToRender = remainingCol >= 0

  return {
    start: clamp(fromCol, 0, items?.length),
    end: clamp(toCol, fromCol, items?.length),
    isNearEnd: hasMoreToRender && remainingCol <= cols.value * bufferRows
  }
})
const renderedItems = computed(() =>
  isValidGrid.value ? items.slice(state.value.start, state.value.end) : []
)

function rowsToHeight(itemsCount: number): string {
  const rows = Math.ceil(itemsCount / cols.value)
  return `${rows * effectiveRowHeight.value}px`
}
const topSpacerStyle = computed<CSSProperties>(() => ({
  height: rowsToHeight(state.value.start)
}))
const bottomSpacerStyle = computed<CSSProperties>(() => ({
  height: rowsToHeight(items.length - state.value.end)
}))

whenever(
  () => state.value.isNearEnd,
  () => {
    emit('approach-end')
  }
)

function updateItemSize(): void {
  if (container.value) {
    // Measure row gap and padding-top from the grid element independently of item size,
    // so these are available even during transient empty states.
    if (gridEl.value) {
      const style = getComputedStyle(gridEl.value)
      const newGap = parseFloat(style.rowGap) || 0
      const newPad = parseFloat(style.paddingTop) || 0
      if (itemRowGap.value !== newGap) itemRowGap.value = newGap
      if (itemPaddingTop.value !== newPad) itemPaddingTop.value = newPad
    }

    const firstItem = container.value.querySelector<HTMLElement>(
      '[data-virtual-grid-item]'
    )
    if (!firstItem?.clientHeight || !firstItem?.clientWidth) return

    if (itemHeight.value !== firstItem.clientHeight) {
      itemHeight.value = firstItem.clientHeight
    }
    if (itemWidth.value !== firstItem.clientWidth) {
      itemWidth.value = firstItem.clientWidth
    }
  }
}
const onResize = debounce(updateItemSize, resizeDebounce)
watch([width, height], onResize, { flush: 'post' })
whenever(() => items, updateItemSize, { flush: 'post' })
onBeforeUnmount(() => {
  onResize.cancel()
})
</script>
