# The library package does not include demos

GameWork titles stay in this repo as **demos**, but a consumer of the
**library** must not install them or their dependencies. Portfolio is a
catalog and a Django host — not a GameWork host.

The alternative was to move playable titles into portfolio so the framework
repo stayed "thin." That would have wired Vite and WebRTC into a Python
monolith with no JS build step, and it would not have fixed the actual
bloat: `chess.js`, `qrcode`, and `uuid` were runtime dependencies of a
package whose `src/` imported none of them. Demos remain in `examples/`;
the published package is `dist/` only. A new GameWork idea starts as a
demo here. Promote it to its own repo only when it must version
independently of the library.
