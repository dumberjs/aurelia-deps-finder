'use strict';
var test = require('tape');
var path = require('path');
var findDeps = require('./index');
var findJsDeps = findDeps.findJsDeps;
var findHtmlDeps = findDeps.findHtmlDeps;

function buildReadFile(fakeFs) {
  return function(p) {
    p = path.normalize(p).replace(/\\/g, '/');
    if (fakeFs && fakeFs.hasOwnProperty(p)) return Promise.resolve(fakeFs[p]);
    return Promise.reject('no file at ' + p);
  };
}

var js = "define(['./a', 'aurelia-pal', 'exports'], function(a,b,e){\n\
  PLATFORM.moduleName('in1');\n\
  p.PLATFORM\n\
    .moduleName ( \"/in2.js\" );\n\
  p.PLATFORM\n\
    .moduleName ( \"in1.js/foo.js\" );\n\
  foo.moduleName('nope');\n\
  PLATFORM.bar('nope');\n\
  PLATFORM.moduleName(NOPE);\n\
  PLATFORM.moduleName('nope' + 4);\n\
  PLATFORM.moduleName('${nope}');\n\
  //duplicate\n\
  PLATFORM.moduleName('in1');\n\
});";
var jsDeps = ['in1', 'in1.js/foo', 'in2.js'];

var html = '<template>\n\
    <require from="a/b"></require>\n\
    <require from="./c.html"></require>\n\
    <div>\n\
      <p>\n\
        <REQUIRE from="d/e.css"></REQUIRE>\n\
      </p>\n\
    </div>\n\
    <require from="no${pe}"></require>\n\
    <require from.bind="nope"></require>\n\
    <!-- <require from="nope"></require> -->\n\
    <compose view-model="vm1" view.bind="nope"></compose>\n\
    <div as-element="compose" view-model="vm2" view="v2"></div>\n\
    <router-view layout-view-model="${nope}" layout-view="lv1"></router-view>\n\
    <unknown as-element="router-view" layout-view-model="lvm2" layout-view="lv2"></unknown>\n\
  </template>';
var htmlDeps = ['a/b', 'lv1', 'lv2', 'lvm2', 'text!./c.html', 'text!d/e.css', 'v2', 'vm1', 'vm2'];

var css = "@import 'other.css';\n.demo { color: blue; }";

test('findJsDeps ignores normal cjs/amd deps', function(t) {
  var contents =
    "define(['a', './b/c', 'exports', 'require', 'module'], function(a,b,e,r,m){return;})";

  findJsDeps('ignore.js', contents, {readFile: buildReadFile({})})
  .then(
    function(result) {
     t.equal(result.length, 0);
    },
    function(err) {
      t.fail(err.message);
    }
  ).then(t.end);
});

test('findJsDeps finds js deps when there is no deps', function(t) {
  findJsDeps('ignore.js', 'define(() => 1);', {readFile: buildReadFile({})})
  .then(
    function(result) {
      t.equal(result.length, 0);
    },
    function(err) {
      t.fail(err.message);
    }
  ).then(t.end);
});

test('findJsDeps finds aurelia PLATFORM.moduleName deps', function(t) {
  findJsDeps('ignore.js', js, {readFile: buildReadFile({})})
  .then(
    function(result) {
      t.deepEqual(result.sort(), jsDeps);
    },
    function(err) {
      t.fail(err.message);
    }
  ).then(t.end);
});

test('findJsDeps throws at syntax error', function(t) {
  t.throws(function() {findJsDeps('ignore.js', 'define(func() {});');});
  t.end();
});

test('findJsDeps finds plugins', function(t) {
/*
import environment from './environment';
import {PLATFORM} from 'aurelia-pal';

export function configure(aurelia) {
  aurelia.use
    .feature('resources')
    .standardConfiguration()
    .plugin('p1')
    .developmentLogging(environment.debug ? 'debug' : 'warn');
  aurelia.use.plugin(PLATFORM.moduleName('pm'));
  aurelia.use.plugin('p2', {foo: 1});
  aurelia.use.plugin('p3', c => c.foo = 1);
  if (environment.testing) {
    aurelia.use.plugin('nope');
    aurelia.use.plugin('nope1', {foo: 1});
    aurelia.use.plugin('nope2', c => c.foo = 1);
  }
  aurelia.start().then(() => aurelia.setRoot());
}
*/
  var file = "'use strict';\n\
\n\
Object.defineProperty(exports, \"__esModule\", {\n\
value: true\n\
});\n\
exports.configure = configure;\n\
var _environment = require('./environment');\n\
var _environment2 = _interopRequireDefault(_environment);\n\
var _aureliaPal = require('aurelia-pal');\n\
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }\n\
function configure(aurelia) {\n\
aurelia.use.feature('resources').standardConfiguration().plugin('p1').developmentLogging(_environment2.default.debug ? 'debug' : 'warn');\n\
aurelia.use.plugin(_aureliaPal.PLATFORM.moduleName('pm'));\n\
aurelia.use.plugin('p2', { foo: 1 });\n\
aurelia.use.plugin('p3', function (c) {\n\
  return c.foo = 1;\n\
});\n\
if (_environment2.default.testing) {\n\
  aurelia.use.plugin('nope');\n\
  aurelia.use.plugin('nope1', { foo: 1 });\n\
  aurelia.use.plugin('nope2', function (c) {\n\
    return c.foo = 1;\n\
  });\n\
}\n\
aurelia.start().then(function () {\n\
  return aurelia.setRoot();\n\
});\n\
}";

  findJsDeps('main.js', file, {readFile: buildReadFile({})})
  .then(
    function(result) {
      t.deepEqual(result.sort(), [
        'aurelia-bootstrapper',
        'aurelia-event-aggregator',
        'aurelia-history-browser',
        'aurelia-loader-default',
        'aurelia-logging-console',
        'aurelia-pal-browser',
        'aurelia-templating-binding',
        'aurelia-templating-resources',
        'aurelia-templating-router',
        'nope',
        'nope1',
        'nope2',
        'p1',
        'p2',
        'p3',
        'pm',
        'resources'
      ]);
    },
    function(err) {
      t.fail(err.message);
    }
  ).then(t.end);
});

test('findJsDeps finds plugins on minimum processed source', function(t) {
/*

*/
  var file = "import environment from './environment';\n\
import {PLATFORM} from 'aurelia-pal';\n\
\n\
export async function configure(aurelia) {\n\
  aurelia.use\n\
    .feature('resources')\n\
    .standardConfiguration()\n\
    .plugin('p1')\n\
    .developmentLogging(environment.debug ? 'debug' : 'warn');\n\
  aurelia.use.plugin(PLATFORM.moduleName('pm'));\n\
  aurelia.use.plugin('p2', {foo: 1});\n\
  aurelia.use.plugin('p3', c => c.foo = 1);\n\
  if (environment.testing) {\n\
    aurelia.use.plugin('nope');\n\
    aurelia.use.plugin('nope1', {foo: 1});\n\
    aurelia.use.plugin('nope2', c => c.foo = 1);\n\
  }\n\
  await aurelia.start();\n\
  await aurelia.setRoot();\n\
}\n\
";

  findJsDeps('main.js', file, {readFile: buildReadFile({})})
  .then(
    function(result) {
      t.deepEqual(result.sort(), [
        'aurelia-bootstrapper',
        'aurelia-event-aggregator',
        'aurelia-history-browser',
        'aurelia-loader-default',
        'aurelia-logging-console',
        'aurelia-pal-browser',
        'aurelia-templating-binding',
        'aurelia-templating-resources',
        'aurelia-templating-router',
        'nope',
        'nope1',
        'nope2',
        'p1',
        'p2',
        'p3',
        'pm',
        'resources'
      ]);
    },
    function(err) {
      t.fail(err.message);
    }
  ).then(t.end);
});

test('findJsDeps finds plugins and global resources in configure', function(t) {
/*
import {BcxService} from './bcx-service';
import environment from '../environment';

export function configure(config) {
  config.globalResources([
    PLATFORM.moduleName('./elements/x-y'),
    './binding-behaviors/z'
  ]);

  config.globalResources('./elements/a');

  config.plugin(PLATFORM.moduleName('ab'));

  config.plugin('p1');
  config.plugin('p2', {foo: 1})
    .plugin('p3', c => c.foo = 1);

  if (environment.testing) {
    config.plugin('nope');
    config.plugin('nope1', {foo: 1})
      .plugin('nope2', c => c.foo = 1);
  }
}
*/
  var file = "'use strict';\n\
Object.defineProperty(exports, \"__esModule\", {\n\
value: true\n\
});\n\
exports.configure = configure;\n\
var _bcxService = require('./bcx-service');\n\
var _environment = require('../environment');\n\
var _environment2 = _interopRequireDefault(_environment);\n\
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }\n\
function configure(config) {\n\
config.globalResources([PLATFORM.moduleName('./elements/x-y'), './binding-behaviors/z']);\n\
config.globalResources('./elements/a');\n\
config.plugin(PLATFORM.moduleName('ab'));\n\
config.plugin('p1');\n\
config.plugin('p2', { foo: 1 }).plugin('p3', function (c) {\n\
  return c.foo = 1;\n\
});\n\
if (_environment2.default.testing) {\n\
  config.plugin('nope');\n\
  config.plugin('nope1', { foo: 1 }).plugin('nope2', function (c) {\n\
    return c.foo = 1;\n\
  });\n\
}\n\
}";

  findJsDeps('index.js', file, {readFile: buildReadFile({})})
  .then(
    function(result) {
      t.deepEqual(result.sort(), [
        './binding-behaviors/z',
        './elements/a',
        './elements/x-y',
        'ab',
        'nope',
        'nope1',
        'nope2',
        'p1',
        'p2',
        'p3'
      ]);
    },
    function(err) {
      t.fail(err.message);
    }
  ).then(t.end);
});

test('findJsDeps find deps on noView', function(t) {
/*
import {noView} from 'aurelia-framework';
@noView(['a.css', './b.css'])
export class MyComp {}
*/
  var file = "'use strict';\n\
\n\
Object.defineProperty(exports, \"__esModule\", {\n\
value: true\n\
});\n\
exports.MyComp = undefined;\n\
var _dec, _class;\n\
var _aureliaFramework = require('aurelia-framework');\n\
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError(\"Cannot call a class as a function\"); } }\n\
var MyComp = exports.MyComp = (_dec = (0, _aureliaFramework.noView)(['a.css', './b.css']), _dec(_class = function MyComp() {\n\
_classCallCheck(this, MyComp);\n\
}) || _class);";

  findJsDeps('my-comp.js', file, {readFile: buildReadFile({})})
  .then(
    function(result) {
      t.deepEqual(result.sort(), ['text!./b.css', 'text!a.css']);
    },
    function(err) {
      t.fail(err.message);
    }
  ).then(t.end);
});

test('findJsDeps find deps on useView', function(t) {
/*
import {useView} from 'aurelia-framework';
@useView('./a.html')
export class MyComp {}
*/

  var file = "'use strict';\n\
Object.defineProperty(exports, \"__esModule\", {\n\
value: true\n\
});\n\
exports.MyComp = undefined;\n\
var _dec, _class;\n\
var _aureliaFramework = require('aurelia-framework');\n\
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError(\"Cannot call a class as a function\"); } }\n\
var MyComp = exports.MyComp = (_dec = (0, _aureliaFramework.useView)('./a.html'), _dec(_class = function MyComp() {\n\
_classCallCheck(this, MyComp);\n\
}) || _class);";

  findJsDeps('my-comp.js', file, {readFile: buildReadFile({})})
  .then(
    function(result) {
      t.deepEqual(result.sort(), ['text!./a.html']);
    },
    function(err) {
      t.fail(err.message);
    }
  ).then(t.end);
});

test('findJsDeps find deps in inlineView html', function(t) {
/*
import {inlineView} from 'aurelia-framework';
@inlineView('<template><require from="./a.css"></require></template>')
export class MyComp {}
*/
  var file = "'use strict';\n\
Object.defineProperty(exports, \"__esModule\", {\n\
value: true\n\
});\n\
exports.MyComp = undefined;\n\
var _dec, _class;\n\
var _aureliaFramework = require('aurelia-framework');\n\
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError(\"Cannot call a class as a function\"); } }\n\
var MyComp = exports.MyComp = (_dec = (0, _aureliaFramework.inlineView)('<template><require from=\"./a.css\"></require></template>'), _dec(_class = function MyComp() {\n\
_classCallCheck(this, MyComp);\n\
}) || _class);";

  findJsDeps('my-comp.js', file, {readFile: buildReadFile({})})
  .then(
    function(result) {
      t.deepEqual(result.sort(), ['text!./a.css']);
    },
    function(err) {
      t.fail(err.message);
    }
  ).then(t.end);
});

test('findJsDeps find deps in inlineView html for TypeScript compiled code', function(t) {
/*
import {inlineView} from 'aurelia-framework';
@inlineView('<template><require from="./a.css"></require></template>')
export class MyComp {}
*/
  var file = "var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {\n\
if (typeof Reflect === \"object\" && typeof Reflect.decorate === \"function\") return Reflect.decorate(decorators, target, key, desc);\n\
switch (arguments.length) {\n\
    case 2: return decorators.reduceRight(function(o, d) { return (d && d(o)) || o; }, target);\n\
    case 3: return decorators.reduceRight(function(o, d) { return (d && d(target, key)), void 0; }, void 0);\n\
    case 4: return decorators.reduceRight(function(o, d) { return (d && d(target, key, o)) || o; }, desc);\n\
}\n\
};\n\
var aurelia_framework_1 = require('aurelia-framework');\n\
var MyComp = (function () {\n\
function MyComp() {\n\
}\n\
MyComp = __decorate([\n\
    aurelia_framework_1.inlineView('<template><require from=\"./a.css\"></require></template>')\n\
], MyComp);\n\
return MyComp;\n\
})();\n\
exports.MyComp = MyComp;";

  findJsDeps('my-comp.js', file, {readFile: buildReadFile({})})
  .then(
    function(result) {
      t.deepEqual(result.sort(), ['text!./a.css']);
    },
    function(err) {
      t.fail(err.message);
    }
  ).then(t.end);
});

test('findJsDeps find deps in inlineView html, and additional deps', function(t) {
/*
import {inlineView} from 'aurelia-framework';
import {PLATFORM} from 'aurelia-pal';
@inlineView('<template><require from="./a.css"></require></template>', ['./b.css', PLATFORM.moduleName('./c.css')])
export class MyComp {}
*/
  var file = "'use strict';\n\
Object.defineProperty(exports, \"__esModule\", {\n\
value: true\n\
});\n\
exports.MyComp = undefined;\n\
var _dec, _class;\n\
var _aureliaFramework = require('aurelia-framework');\n\
var _aureliaPal = require('aurelia-pal');\n\
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError(\"Cannot call a class as a function\"); } }\n\
var MyComp = exports.MyComp = (_dec = (0, _aureliaFramework.inlineView)('<template><require from=\"./a.css\"></require></template>', ['./b.css', _aureliaPal.PLATFORM.moduleName('./c.css')]), _dec(_class = function MyComp() {\n\
_classCallCheck(this, MyComp);\n\
}) || _class);";

  findJsDeps('my-comp.js', file, {readFile: buildReadFile({})})
  .then(
    function(result) {
      t.deepEqual(result.sort(), ['text!./a.css', 'text!./b.css', 'text!./c.css']);
    },
    function(err) {
      t.fail(err.message);
    }
  ).then(t.end);
});

test('findJsDeps find html file by aurelia view convention', function(t) {
  findJsDeps('src/foo.js', 'a();', {readFile: buildReadFile({
    'src/foo.html': 'contents'
  })})
  .then(
    function(result) {
      t.deepEqual(result.sort(), ['text!./foo.html']);
    },
    function(err) {
      t.fail(err.message);
    }
  ).then(t.end);
});


test('findHtmlDeps finds all require deps', function(t) {
  t.deepEqual(findHtmlDeps('ignore.html', html).sort(), htmlDeps);
  t.end();
});

test('findHtmlDeps silents at syntax error', function(t) {
  t.equal(findHtmlDeps('ignore.html', '</template>').length, 0);
  t.end();
});

test('findDeps find html file by aurelia view convention', function(t) {
  findDeps('src/foo.js', 'a();', {readFile: buildReadFile({
    'src/foo.html': 'contents'
  })})
  .then(
    function(result) {
      t.deepEqual(result.sort(), ['text!./foo.html']);
    },
    function(err) {
      t.fail(err.message);
    }
  ).then(t.end);
});

test('findDeps finds js deps', function(t) {
  findDeps('ignore.js', js, {readFile: buildReadFile({})})
  .then(
    function(result) {
      t.deepEqual(result.sort(), jsDeps);
    },
    function(err) {
      t.fail(err.message);
    }
  ).then(t.end);
});

test('findDeps finds js deps', function(t) {
  findDeps('IGNORE.js', js, {readFile: buildReadFile({})})
  .then(
    function(result) {
      t.deepEqual(result.sort(), jsDeps);
    },
    function(err) {
      t.fail(err.message);
    }
  ).then(t.end);
});

test('findDeps finds html deps', function(t) {
  Promise.resolve(findDeps('ignore.html', html, {readFile: buildReadFile({})}))
  .then(
    function(result) {
      t.deepEqual(result.sort(), htmlDeps);
    },
    function(err) {
      t.fail(err.message);
    }
  ).then(t.end);
});

test('findDeps passes other files', function(t) {
   Promise.resolve(findDeps('ignore.css', css, {readFile: buildReadFile({})}))
  .then(
    function(result) {
      t.equal(result.length, 0);
    },
    function(err) {
      t.fail(err.message);
    }
  ).then(t.end);
});

function mkJsonResponse (obj) {
  return {
    ok: true,
    json: function() { return Promise.resolve(obj); }
  }
}

function mockFetch (url) {
  return new Promise(function(resolve) {
    setTimeout(function() {
      if (url === '//data.jsdelivr.com/v1/package/npm/foo@1.0.0') {
        resolve(mkJsonResponse({
          files: [
            {
              type: 'file',
              name: 'package.json'
            },
            {
              type: 'directory',
              name: 'dist',
              files: [
                {
                  type: 'file',
                  name: 'bar.js'
                },
                {
                  type: 'file',
                  name: 'bar.html'
                }
              ]
            }
          ]
        }));
      } else if (url === '//data.jsdelivr.com/v1/package/npm/bar@2.0.0') {
        resolve(mkJsonResponse({
          files: [
            {
              type: 'file',
              name: 'package.json'
            },
            {
              type: 'file',
              name: 'lo.js'
            }
          ]
        }));
      } else {
        resolve({statusText: 'Not Found'});
      }
    }, 10);
  });
}

if (process.browser) {
  test('findDeps finds html file pair in jsdelivr', function(t) {
    findDeps('//cdn.jsdelivr.net/npm/foo@1.0.0/dist/bar.js', 'var a=1;', {fetch: mockFetch})
      .then(
      function(result) {
        t.deepEqual(result.sort(), ['text!./bar.html']);
      },
      function(err) {
        t.fail(err.message);
      }
    ).then(t.end);
  });

  test('findDeps sees missing html file pair in jsdelivr', function(t) {
    findDeps('//cdn.jsdelivr.net/npm/bar@2.0.0/lo.js', 'var a=1;', {fetch: mockFetch})
      .then(
      function(result) {
        t.deepEqual(result.sort(), []);
      },
      function(err) {
        t.fail(err.message);
      }
    ).then(t.end);
  });
}
