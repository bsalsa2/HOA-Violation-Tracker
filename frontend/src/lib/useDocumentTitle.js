import { useEffect } from 'react'

/** Keeps the browser tab title in sync with the active view. */
export default function useDocumentTitle(title) {
  useEffect(() => {
    if (title) document.title = title
  }, [title])
}
