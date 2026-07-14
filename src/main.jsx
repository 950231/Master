import React from 'react'
import ReactDOM from 'react-dom/client'
import Root from './Root.jsx'
import { applyStoredTheme } from './ThemePicker.jsx'
import './index.css'

// Apply the saved theme before first paint to avoid a flash.
applyStoredTheme()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
