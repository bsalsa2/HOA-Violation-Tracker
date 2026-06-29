import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Feed the champagne spotlight: update CSS vars on whichever .vt-spotlight
// card the pointer is over. One passive listener for the whole app.
if (typeof window !== 'undefined') {
  let frame = 0
  window.addEventListener('pointermove', (e) => {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      const card = e.target.closest?.('.vt-spotlight')
      if (!card) return
      const r = card.getBoundingClientRect()
      card.style.setProperty('--mx', `${e.clientX - r.left}px`)
      card.style.setProperty('--my', `${e.clientY - r.top}px`)
    })
  }, { passive: true })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
