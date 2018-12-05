'use strict';
import findDeps, {findJsDeps, findHtmlDeps} from './index';
import test from 'tape';
import path from 'path';

function buildReadFile(fakeFs = {}) {
  return p => {
    p = path.normalize(p).replace(/\\/g, '/');
    if (fakeFs.hasOwnProperty(p)) return Promise.resolve(fakeFs[p]);
    return Promise.reject('no file at ' + p);
  };
}

let js = `
define(['./a', 'aurelia-pal', 'exports'], function(a,b,e){
  PLATFORM.moduleName('in1');
  p.PLATFORM
    .moduleName ( "/in2.js" );
  p.PLATFORM
    .moduleName ( "in1.js/foo.js" );
  foo.moduleName('nope');
  PLATFORM.bar('nope');
  PLATFORM.moduleName(NOPE);
  PLATFORM.moduleName('nope' + 4);
  PLATFORM.moduleName('$\{nope}');
  //duplicate
  PLATFORM.moduleName('in1');
});
`;
let jsDeps = ['in1', 'in1.js/foo', 'in2.js'];

let html = `
  <template>
    <require from="a/b"></require>
    <require from="./c.html"></require>
    <div>
      <p>
        <REQUIRE from="d/e.css"></REQUIRE>
      </p>
    </div>

    <require from="no$\{pe}"></require>
    <require from.bind="nope"></require>
    <!-- <require from="nope"></require> -->

    <compose view-model="vm1" view.bind="nope"></compose>
    <div as-element="compose" view-model="vm2" view="v2"></div>

    <router-view layout-view-model="$\{nope}" layout-view="lv1"></router-view>
    <unknown as-element="router-view" layout-view-model="lvm2" layout-view="lv2"></unknown>
  </template>
`;
let htmlDeps = ['./c.html', 'a/b', 'd/e.css', 'lv1', 'lv2', 'lvm2', 'v2', 'vm1', 'vm2'];

let css = `
@import 'other.css';
.demo { color: blue; }
`;


test('findJsDeps ignores normal cjs/amd deps', t => {
  let contents =
    "define(['a', './b/c', 'exports', 'require', 'module'], function(a,b,e,r,m){return;})";

  findJsDeps('ignore.js', contents, {readFile: buildReadFile({})})
  .then(
    result => {
     t.equal(result.length, 0);
    },
    err => {
      t.fail(err.message);
    }
  ).then(t.end);
});

test('findJsDeps finds js deps when there is no deps', t => {
  findJsDeps('ignore.js', 'define(() => 1);', {readFile: buildReadFile({})})
  .then(
    result => {
      t.equal(result.length, 0);
    },
    err => {
      t.fail(err.message);
    }
  ).then(t.end);
});

test('findJsDeps finds aurelia PLATFORM.moduleName deps', t => {
  findJsDeps('ignore.js', js, {readFile: buildReadFile({})})
  .then(
    result => {
      t.deepEqual(result.sort(), jsDeps);
    },
    err => {
      t.fail(err.message);
    }
  ).then(t.end);
});

test('findJsDeps throws at syntax error', t => {
  t.throws(() => findJsDeps('ignore.js', 'define(func() {});'));
  t.end();
});

test('findJsDeps finds plugins, but ignores plugin behind if condition', t => {
/*
import environment from './environment';
import {PLATFORM} from 'aurelia-pal';

export function configure(aurelia) {
  aurelia.use
    .feature('resources');
    .standardConfiguration();
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
  let file = `
'use strict';

Object.defineProperty(exports, "__esModule", {
value: true
});
exports.configure = configure;
var _environment = require('./environment');
var _environment2 = _interopRequireDefault(_environment);
var _aureliaPal = require('aurelia-pal');
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function configure(aurelia) {
aurelia.use.feature('resources').standardConfiguration().plugin('p1').developmentLogging(_environment2.default.debug ? 'debug' : 'warn');
aurelia.use.plugin(_aureliaPal.PLATFORM.moduleName('pm'));
aurelia.use.plugin('p2', { foo: 1 });
aurelia.use.plugin('p3', function (c) {
  return c.foo = 1;
});
if (_environment2.default.testing) {
  aurelia.use.plugin('nope');
  aurelia.use.plugin('nope1', { foo: 1 });
  aurelia.use.plugin('nope2', function (c) {
    return c.foo = 1;
  });
}
aurelia.start().then(function () {
  return aurelia.setRoot();
});
}
`;
  findJsDeps('main.js', file, {readFile: buildReadFile({})})
  .then(
    result => {
      t.deepEqual(result.sort(), [
        'aurelia-event-aggregator',
        'aurelia-history-browser',
        'aurelia-logging-console',
        'aurelia-templating-binding',
        'aurelia-templating-resources',
        'aurelia-templating-router',
        'p1',
        'p2',
        'p3',
        'pm',
        'resources'
      ]);
    },
    err => {
      t.fail(err.message);
    }
  ).then(t.end);
});

test('findJsDeps finds plugins and global resources in configure, but ignores plugin behind if condition', t => {
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
  let file = `
'use strict';

Object.defineProperty(exports, "__esModule", {
value: true
});
exports.configure = configure;
var _bcxService = require('./bcx-service');
var _environment = require('../environment');
var _environment2 = _interopRequireDefault(_environment);
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function configure(config) {
config.globalResources([PLATFORM.moduleName('./elements/x-y'), './binding-behaviors/z']);
config.globalResources('./elements/a');
config.plugin(PLATFORM.moduleName('ab'));
config.plugin('p1');
config.plugin('p2', { foo: 1 }).plugin('p3', function (c) {
  return c.foo = 1;
});
if (_environment2.default.testing) {
  config.plugin('nope');
  config.plugin('nope1', { foo: 1 }).plugin('nope2', function (c) {
    return c.foo = 1;
  });
}
}
`;

  findJsDeps('index.js', file, {readFile: buildReadFile({})})
  .then(
    result => {
      t.deepEqual(result.sort(), [
        './binding-behaviors/z',
        './elements/a',
        './elements/x-y',
        'ab', 'p1', 'p2', 'p3'
      ]);
    },
    err => {
      t.fail(err.message);
    }
  ).then(t.end);
});

test('findJsDeps find deps on noView', t => {
/*
import {noView} from 'aurelia-framework';
@noView(['a.css', './b.css'])
export class MyComp {}
*/
  let file = `
'use strict';

Object.defineProperty(exports, "__esModule", {
value: true
});
exports.MyComp = undefined;
var _dec, _class;
var _aureliaFramework = require('aurelia-framework');
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
var MyComp = exports.MyComp = (_dec = (0, _aureliaFramework.noView)(['a.css', './b.css']), _dec(_class = function MyComp() {
_classCallCheck(this, MyComp);
}) || _class);
`;
  findJsDeps('my-comp.js', file, {readFile: buildReadFile({})})
  .then(
    result => {
      t.deepEqual(result.sort(), ['./b.css', 'a.css']);
    },
    err => {
      t.fail(err.message);
    }
  ).then(t.end);
});

test('findJsDeps find deps on useView', t => {
/*
import {useView} from 'aurelia-framework';
@useView('./a.html')
export class MyComp {}
*/

  let file = `
'use strict';
Object.defineProperty(exports, "__esModule", {
value: true
});
exports.MyComp = undefined;
var _dec, _class;
var _aureliaFramework = require('aurelia-framework');
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
var MyComp = exports.MyComp = (_dec = (0, _aureliaFramework.useView)('./a.html'), _dec(_class = function MyComp() {
_classCallCheck(this, MyComp);
}) || _class);
`;

  findJsDeps('my-comp.js', file, {readFile: buildReadFile({})})
  .then(
    result => {
      t.deepEqual(result.sort(), ['./a.html']);
    },
    err => {
      t.fail(err.message);
    }
  ).then(t.end);
});

test('findJsDeps find deps in inlineView html', t => {
/*
import {inlineView} from 'aurelia-framework';
@inlineView('<template><require from="./a.css"></require></template>')
export class MyComp {}
*/
  let file = `
'use strict';
Object.defineProperty(exports, "__esModule", {
value: true
});
exports.MyComp = undefined;
var _dec, _class;
var _aureliaFramework = require('aurelia-framework');
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
var MyComp = exports.MyComp = (_dec = (0, _aureliaFramework.inlineView)('<template><require from="./a.css"></require></template>'), _dec(_class = function MyComp() {
_classCallCheck(this, MyComp);
}) || _class);
`;

  findJsDeps('my-comp.js', file, {readFile: buildReadFile({})})
  .then(
    result => {
      t.deepEqual(result.sort(), ['./a.css']);
    },
    err => {
      t.fail(err.message);
    }
  ).then(t.end);
});

test('findJsDeps find deps in inlineView html for TypeScript compiled code', t => {
/*
import {inlineView} from 'aurelia-framework';
@inlineView('<template><require from="./a.css"></require></template>')
export class MyComp {}
*/
  let file = `
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
if (typeof Reflect === "object" && typeof Reflect.decorate === "function") return Reflect.decorate(decorators, target, key, desc);
switch (arguments.length) {
    case 2: return decorators.reduceRight(function(o, d) { return (d && d(o)) || o; }, target);
    case 3: return decorators.reduceRight(function(o, d) { return (d && d(target, key)), void 0; }, void 0);
    case 4: return decorators.reduceRight(function(o, d) { return (d && d(target, key, o)) || o; }, desc);
}
};
var aurelia_framework_1 = require('aurelia-framework');
var MyComp = (function () {
function MyComp() {
}
MyComp = __decorate([
    aurelia_framework_1.inlineView('<template><require from="./a.css"></require></template>')
], MyComp);
return MyComp;
})();
exports.MyComp = MyComp;
`;

  findJsDeps('my-comp.js', file, {readFile: buildReadFile({})})
  .then(
    result => {
      t.deepEqual(result.sort(), ['./a.css']);
    },
    err => {
      t.fail(err.message);
    }
  ).then(t.end);
});

test('findJsDeps find deps in inlineView html, and additional deps', t => {
/*
import {inlineView} from 'aurelia-framework';
import {PLATFORM} from 'aurelia-pal';
@inlineView('<template><require from="./a.css"></require></template>', ['./b.css', PLATFORM.moduleName('./c.css')])
export class MyComp {}
*/
  let file = `
'use strict';
Object.defineProperty(exports, "__esModule", {
value: true
});
exports.MyComp = undefined;
var _dec, _class;
var _aureliaFramework = require('aurelia-framework');
var _aureliaPal = require('aurelia-pal');
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
var MyComp = exports.MyComp = (_dec = (0, _aureliaFramework.inlineView)('<template><require from="./a.css"></require></template>', ['./b.css', _aureliaPal.PLATFORM.moduleName('./c.css')]), _dec(_class = function MyComp() {
_classCallCheck(this, MyComp);
}) || _class);
`;

  findJsDeps('my-comp.js', file, {readFile: buildReadFile({})})
  .then(
    result => {
      t.deepEqual(result.sort(), ['./a.css', './b.css', './c.css']);
    },
    err => {
      t.fail(err.message);
    }
  ).then(t.end);
});

test('findJsDeps find html file by aurelia view convention', t => {
  findJsDeps('src/foo.js', 'a();', {readFile: buildReadFile({
    'src/foo.html': 'contents'
  })})
  .then(
    result => {
      t.deepEqual(result.sort(), ['./foo.html']);
    },
    err => {
      t.fail(err.message);
    }
  ).then(t.end);
});


test('findHtmlDeps finds all require deps', t => {
  t.deepEqual(findHtmlDeps('ignore.html', html).sort(), htmlDeps);
  t.end();
});

test('findHtmlDeps silents at syntax error', t => {
  t.equal(findHtmlDeps('ignore.html', '</template>').length, 0);
  t.end();
});

test('findDeps find html file by aurelia view convention', t => {
  findDeps('src/foo.js', 'a();', {readFile: buildReadFile({
    'src/foo.html': 'contents'
  })})
  .then(
    result => {
      t.deepEqual(result.sort(), ['./foo.html']);
    },
    err => {
      t.fail(err.message);
    }
  ).then(t.end);
});

test('findDeps finds js deps', t => {
  findDeps('ignore.js', js, {readFile: buildReadFile({})})
  .then(
    result => {
      t.deepEqual(result.sort(), jsDeps);
    },
    err => {
      t.fail(err.message);
    }
  ).then(t.end);
});

test('findDeps finds js deps', t => {
  findDeps('IGNORE.js', js, {readFile: buildReadFile({})})
  .then(
    result => {
      t.deepEqual(result.sort(), jsDeps);
    },
    err => {
      t.fail(err.message);
    }
  ).then(t.end);
});

test('findDeps finds html deps', t => {
  Promise.resolve(findDeps('ignore.html', html, {readFile: buildReadFile({})}))
  .then(
    result => {
      t.deepEqual(result.sort(), htmlDeps);
    },
    err => {
      t.fail(err.message);
    }
  ).then(t.end);
});

test('findDeps passes other files', t => {
   Promise.resolve(findDeps('ignore.css', css, {readFile: buildReadFile({})}))
  .then(
    result => {
      t.equal(result.length, 0);
    },
    err => {
      t.fail(err.message);
    }
  ).then(t.end);
});
