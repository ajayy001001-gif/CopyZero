# face-api.js model weights — required, not included

`useProctoring.js` loads `face-api.js`'s tiny face detector from this
directory at runtime (`faceapi.nets.tinyFaceDetector.loadFromUri('/models')`).
The weight files are NOT committed to this repo (binary model files don't
belong in git history) — download them once, manually:

1. Go to https://github.com/justadudewhohacks/face-api.js/tree/master/weights
2. Download these files into this directory (`frontend/public/models/`):
   - `tiny_face_detector_model-weights_manifest.json`
   - `tiny_face_detector_model-shard1`

That's it — only the tiny face detector is used (presence/count detection
only, no facial recognition), so no other model files are needed.

In production, these are served as static files by Vite/whatever host serves
`frontend/dist` — no server-side handling required, just make sure the build
includes this directory (Vite copies `public/` as-is by default).
