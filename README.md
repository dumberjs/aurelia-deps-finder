# aurelia-deps-finder ![CI](https://github.com/dumberjs/aurelia-deps-finder/workflows/CI/badge.svg)

Aurelia deps finder for dumber bundler. This is only needed for Aurelia v1, not Aurelia 2 (vNext).

```js
const dumber = require('gulp-dumber');
const auDepsFinder = require('aurelia-deps-finder');

const dr = dumber({depsFinder: auDepsFinder});
```
