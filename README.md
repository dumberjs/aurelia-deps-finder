# aurelia-deps-finder [![Build Status](https://travis-ci.org/dumberjs/aurelia-deps-finder.svg?branch=master)](https://travis-ci.org/dumberjs/aurelia-deps-finder)

Aurelia deps finder for dumber bundler. This is only needed for Aurelia v1, not Aurelia 2 (vNext).

```js
const dumber = require('gulp-dumber');
const auDepsFinder = require('aurelia-deps-finder');

const dr = dumber({depsFinder: auDepsFinder});
```
