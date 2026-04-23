import { computed } from 'vue'

import type { AssetItem } from '@/platform/assets/schemas/assetSchema'
import { useAssetsStore } from '@/stores/assetsStore'

/**
 * Composable for fetching media assets from local environment
 * Uses AssetsStore for centralized state management
 */
export function useInternalFilesApi(directory: 'input' | 'output') {
  const assetsStore = useAssetsStore()

  const media = computed(() =>
    directory === 'input'
      ? assetsStore.inputAssets
      : assetsStore.outputFileAssets
  )

  const loading = computed(() =>
    directory === 'input'
      ? assetsStore.inputLoading
      : assetsStore.outputFilesLoading
  )

  const error = computed(() =>
    directory === 'input'
      ? assetsStore.inputError
      : assetsStore.outputFilesError
  )

  const fetchMediaList = async (): Promise<AssetItem[]> => {
    if (directory === 'input') {
      await assetsStore.updateInputs()
      return assetsStore.inputAssets
    } else {
      await assetsStore.updateOutputFiles()
      return assetsStore.outputFileAssets
    }
  }

  const refresh = () => fetchMediaList()

  const loadMore = async (): Promise<void> => {
    // Output file listing returns all at once; no pagination needed
  }

  const hasMore = computed(() => false)

  const isLoadingMore = computed(() => false)

  return {
    media,
    loading,
    error,
    fetchMediaList,
    refresh,
    loadMore,
    hasMore,
    isLoadingMore
  }
}
