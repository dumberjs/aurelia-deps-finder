'use strict';
require('dumber').ensureParserSet();
var fsReadFile = require('dumber/lib/shared').fsReadFile;
var idUtils = require('dumber-module-loader/dist/id-utils');
var ext = idUtils.ext;
var astMatcher = require('ast-matcher');
var depFinder = astMatcher.depFinder;
var ensureParsed = astMatcher.ensureParsed;
var htmlparser = require('htmlparser2');

var jsdelivr_regext = /^(?:https?:)?\/\/cdn.jsdelivr.net\/npm\/(.[^@]*)@([^/]+)\/(.+)$/;

function buildFileSet(files, folder) {
  var set = new Set();
  var prefix = folder ? (folder + '/') : '';

  files.forEach(function(node) {
    if (node.type === 'directory') {
      buildFileSet(node.files, prefix + node.name)
        .forEach(function(f) { set.add(f); });
    } else if (node.type === 'file') {
      set.add(prefix + node.name);
    }
  });

  return set;
}

var fileLists = {};
function whenFileListReady(packageName, version, _fetch) {
  var key = packageName + '@' + version;

  if (!fileLists.hasOwnProperty(key)) {
    fileLists[key] = _fetch('//data.jsdelivr.com/v1/package/npm/' + key)
      .then(function(response) {
        if (response.ok) return response.json();
        return {files: []};
      })
      .then(function(result) {
        return buildFileSet(result.files);
      });
  }

  return fileLists[key];
}

var readFile;
if (process.browser) {
  readFile = function (filepath, _fetch) {
    var m = filepath.match(jsdelivr_regext);
    if (m) {
      var packageName = m[1];
      var version = m[2];
      var fpath = m[3];

      return whenFileListReady(packageName, version, _fetch)
        .then(function(files) {
          if (!files.has(fpath)) {
            throw new Error('no file "' + fpath + '" in ' + packageName + '@' + version);
          }
          // file exist, don't care about file content
        });
    } else {
      return fsReadFile(filepath);
    }
  }
} else {
  readFile = fsReadFile;
}

var auJsDepFinder = depFinder(
  'PLATFORM.moduleName(__dep)',
  '__any.PLATFORM.moduleName(__dep)',
  'PLATFORM.moduleName(__dep, __any)',
  '__any.PLATFORM.moduleName(__dep, __any)',

  // any babel master? pls tell me
  // why babel put (0, ) in front.
  // for babel compiled code
  '(__any, __any.useView)(__dep)',
  '(__any, __any.noView)([__deps])',
  '(__any, __any.inlineView)(__any, [__deps])',
  // for TypeScript compiled code
  '__any.useView(__dep)',
  '__any.noView([__deps])',
  '__any.inlineView(__any, [__deps])'

  // there is a feature on noView and inlineView that
  // supports optional base url.
  // that feature DOES NOT work, so I don't support it now.
  // https://github.com/aurelia/templating/issues/605
  //
  // even if we need to support it,
  // I can go down to astMatcher to support it, no sweat.
  // 1. ignores deps if base url starts with https:// or http://
  // 2. use path.resolve('/', baseUrl, dep).slice(1) to get real deps
);

var _checkConfigureFunc = [
  astMatcher('function configure(__any_auVar) {__anl_body}'),
  astMatcher('function configure(__any_auVar, __any) {__anl_body}'),
  astMatcher('async function configure(__any_auVar) {__anl_body}'),
  astMatcher('async function configure(__any_auVar, __any) {__anl_body}'),
  astMatcher('exports.configure = function (__any_auVar) {__anl_body};'),
  astMatcher('exports.configure = function(__any_auVar, __any) {__anl_body};'),
  astMatcher('exports.configure = async function (__any_auVar) {__anl_body};'),
  astMatcher('exports.configure = async function(__any_auVar, __any) {__anl_body};')
];

var _auConfigureDeps = depFinder(
  // forgive users don't know about PLATFORM.moduleName
  '__any.plugin(__dep)',
  '__any.plugin(__dep, __any)',

  '__any.feature(__dep)',
  '__any.feature(__dep, __any)',

  '__any.globalResources(__dep)',
  '__any.globalResources([__deps])'
);

var _methodCall = astMatcher('__any.__any_method()');
var auConfigModuleNames = {
  defaultBindingLanguage: ['aurelia-templating-binding'],
  router: ['aurelia-templating-router'],
  history: ['aurelia-history-browser'],
  defaultResources: ['aurelia-templating-resources'],
  eventAggregator: ['aurelia-event-aggregator'],
  developmentLogging: ['aurelia-logging-console'],
  basicConfiguration: [
    'aurelia-templating-binding',
    'aurelia-templating-resources',
    'aurelia-event-aggregator'
  ],
  standardConfiguration: [
    'aurelia-templating-binding',
    'aurelia-templating-resources',
    'aurelia-event-aggregator',
    'aurelia-history-browser',
    'aurelia-templating-router'
  ]
};

var entryDeps = [
  'aurelia-bootstrapper',
  'aurelia-loader-default',
  'aurelia-pal-browser'
];

// https://github.com/aurelia/framework/pull/851
var auDevLogWithOptionalLevel = astMatcher('__any.developmentLogging(__any)');

function auConfigureDepFinder(contents) {
  // the way to find configure function is not waterproof
  var configFunc;

  _checkConfigureFunc.find(function(check) {
    var m = check(contents);
    // only want single configure func
    if (m && m.length === 1) {
      configFunc = m[0];
      return true; // break find loop
    }
  });

  if (!configFunc) return [];

  var auVar = configFunc.match.auVar.name;

  var configureFuncBody = {
    type: 'BlockStatement',
    // The matched body is an array, wrap them under single node,
    // so that I don't need to call forEach to deal with them.
    body: configFunc.match.body
  };

  var isLikelyAureliaConfigFile;
  var isAureliaMainFile = !!(astMatcher(auVar + '.start()')(contents));

  if (!isAureliaMainFile) {
    // an aurelia plugin entry file is likely to call one of
    // 'globalResources', 'feature', or 'plugin'
    isLikelyAureliaConfigFile = !!(astMatcher(auVar + '.globalResources(__anl)')(contents) ||
                                   astMatcher(auVar + '.feature(__anl)')(contents) ||
                                   astMatcher(auVar + '.plugin(__anl)')(contents));
  }

  var deps = new Set();
  var add = _add.bind(deps);

  if (isAureliaMainFile) {
    var match = _methodCall(configureFuncBody);
    if (match) {
      // track aurelia dependency based on user configuration.
      match.forEach(function(m) {
        var methodName = m.match.method.name;
        var _deps = auConfigModuleNames[methodName];
        if (_deps) {
          entryDeps.forEach(add);
          _deps.forEach(add);
        }
      });
    }

    if (auDevLogWithOptionalLevel(configureFuncBody)) {
      auConfigModuleNames.developmentLogging.forEach(add);
    }
  }

  if (isAureliaMainFile || isLikelyAureliaConfigFile) {
    _auConfigureDeps(configureFuncBody).forEach(add);
  }

  return Array.from(deps);
}

var inlineViewExtract = depFinder(
  // for babel compiled code
  '(__any, __any.inlineView)(__dep)',
  '(__any, __any.inlineView)(__dep, __any)',
  // for TypeScript compiled code
  '__any.inlineView(__dep)',
  '__any.inlineView(__dep, __any)'
);

var auInlineViewDepsFinder = function(contents) {
  var match = inlineViewExtract(contents);
  if (match.length === 0) return [];

  // If user accidentally calls inlineView more than once,
  // aurelia renders first inlineView without any complain.
  // But this assumes there is only one custom element
  // class implementation in current js file.
  return findHtmlDeps('', match[0]);
};

// helper to add deps to a set
// accepts string, or array, or set.
function _add(deps) {
  if (!deps) return;
  if (typeof deps === 'string') deps = [deps];

  var that = this;
  deps.forEach(function(d) {
    if (!d) return;
    // ignore string interpolation
    // <compose view-model="./foo/${bar}"></compose>
    if (d.indexOf('$') >= 0) return;

    var clean = d.trim();
    // strip off leading /
    if (clean[0] === '/') clean = clean.slice(1);

    // There is some npm package call itself like "popper.js",
    // cannot strip .js from it.
    if (!isPackageName(clean)) {
      // strip off tailing .js
      clean = clean.replace(/\.js$/ig, '');
    }

    that.add(clean);
  });
}

function auDep(dep) {
  if (!dep) return dep;
  var _ext = ext(dep);
  if (_ext === '.html' || _ext === '.css') {
    return 'text!' + dep;
  }
  return dep;
}

function isPackageName(id) {
  if (id.startsWith('.')) return false;
  var parts = id.split('/');
  // package name, or scope package name
  return parts.length === 1 || (parts.length === 2 && parts[0].startsWith('@'));
}

function findJsDeps(filename, contents, mock) {
  var _readFile = (mock && mock.readFile) || readFile;
  var _fetch = (mock && mock.fetch) || global.fetch;
  var deps = new Set();
  var add = _add.bind(deps);

  // for all following static analysis,
  // only parse once for efficiency
  var parsed = ensureParsed(contents);

  // aurelia dependencies PLATFORM.moduleName and some others
  add(auJsDepFinder(parsed).map(function(d) { return auDep(d); }));

  // aurelia deps in configure func without PLATFORM.moduleName
  add(auConfigureDepFinder(parsed).map(function(d) { return auDep(d); }));

  // aurelia deps in inlineView template
  add(auInlineViewDepsFinder(parsed));

  // aurelia view convention, try foo.html for every foo.js
  var htmlPair = filename.slice(0, -3) + '.html';
  var sep = filename.lastIndexOf('/') + 1;
  var localHtmlPair = htmlPair.slice(sep);

  return _readFile(htmlPair, _fetch).then(
    function() {
      // got html file
      add('text!./' + localHtmlPair);
    },
    function() {}
  ).then(function() {return Array.from(deps);});
}

function findHtmlDeps(filename, contents) {
  var deps = new Set();
  var add = _add.bind(deps);

  var parser = new htmlparser.Parser({
    onopentag: function(name, attrs) {
      // <require from="dep"></require>
      if (name === 'require' && attrs.from) {
        add(auDep(attrs.from));
      // <compose view-model="vm" view="view"></compose>
      // <any as-element="compose" view-model="vm" view="view"></any>
      } else if (name === 'compose' || attrs['as-element'] === 'compose') {
        add([auDep(attrs['view-model']), auDep(attrs.view)]);
      // <router-view layout-view-model="lvm" layout-view="ly"></router-view>
      // <any as-element === 'router-view' layout-view-model="lvm" layout-view="ly"></any>
      } else if (name === 'router-view' || attrs['as-element'] === 'router-view') {
        add([auDep(attrs['layout-view-model']), auDep(attrs['layout-view'])]);
      }
    }
  });
  parser.write(contents);
  parser.end();

  return Array.from(deps);
}

function findDeps(filename, contents, mock) {
  var _ext = ext(filename);

  if (_ext === '.js') {
    return findJsDeps(filename, contents, mock);
  } else if (_ext === '.html' || _ext === '.htm') {
    return findHtmlDeps(filename, contents);
  }

  return [];
}

findDeps.findJsDeps = findJsDeps;
findDeps.findHtmlDeps = findHtmlDeps;
module.exports = findDeps;
