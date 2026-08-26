# Tests

An end-to-end suite that opens the real page in Chromium, types into the terminal
like a student would, and asserts on what the simulator actually did — not on what
was typed.

```bash
npm install     # pulls playwright
npx playwright install chromium   # once, if you do not already have a browser
npm test
```

Useful environment variables:

| Variable | Effect |
|---|---|
| `HEADED=1` | show the browser instead of running headless |
| `PORT=9000` | serve the site on a different port |
| `CHROMIUM_PATH=...` | use a specific Chromium binary |

Screenshots are written to `test/screenshots/` (git-ignored).

The suite fails the build if **any** check fails or if the page logs a single
JavaScript error.
