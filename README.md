# Cliper

Editor de clips verticales (9:16) con IA que funciona 100 % en el dispositivo: ffmpeg.wasm, Whisper (transformers.js) y MediaPipe. Sin servidor: cuentas, créditos y videos se guardan localmente.

- Web: https://santiage999-debug.github.io/cliper/
- App Android: https://github.com/santiage999-debug/cliper/releases/latest/download/Cliper.apk

```bash
npm install
npm run dev          # desarrollo
npm run build        # web (dist/)
npx cap sync android && (cd android && ./gradlew assembleDebug)   # APK
```
