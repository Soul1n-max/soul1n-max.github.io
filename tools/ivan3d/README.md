# 3D-Иван на экране входа

- `img/ivan/ivan.glb` — модель Ивана, облегчённая из исходника `ИВАН.glb` (28 МБ, ~950 тыс. треугольников, сделан в tripo3d.ai):
  ```
  npx @gltf-transform/cli@4 simplify ИВАН.glb s.glb --ratio 0.06 --error 0.001
  npx @gltf-transform/cli@4 resize s.glb r.glb --width 1024 --height 1024
  npx @gltf-transform/cli@4 webp r.glb w.glb --quality 82
  npx @gltf-transform/cli@4 quantize w.glb ivan.glb
  ```
  Сжатие draco/meshopt не используем: их декодерам нужен WebAssembly, а CSP его не разрешает.
- `js/vendor/ivan3d.js` — `ivan3d.mjs` + three.js 0.181, собранные в один файл (CSP не пускает importmap и CDN):
  ```
  npm i three@0.181 esbuild
  npx esbuild ivan3d.mjs --bundle --minify --format=iife --target=es2019 --legal-comments=eof --outfile=../../js/vendor/ivan3d.js
  ```
- Подключение — в конце `js/auth.js` (только на компьютере, после загрузки страницы). Для загрузки модели в CSP
  добавлены `connect-src 'self' blob:` и `img-src blob:`.
