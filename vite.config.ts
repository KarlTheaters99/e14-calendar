import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/e14-calendar/',  // 👈 ADD THIS LINE

})
