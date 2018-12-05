import 'dumber/dist/ensure-parser-set';
import {fsReadFile} from 'dumber/dist/shared';
import {ext, parse} from 'dumber-module-loader/dist/id-utils';
import astMatcher, {depFinder, ensureParsed} from 'ast-matcher';
import htmlparser from 'htmlparser2';

const auJsDepFinder = depFinder(
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

const _checkConfigureFunc = [
  astMatcher('function configure(__any_auVar) {__anl_body}'),
  astMatcher('function configure(__any_auVar, __any) {__anl_body}'),
  astMatcher('exports.configure = function (__any_auVar) {__anl_body};'),
  astMatcher('exports.configure = function(__any_auVar, __any) {__anl_body};')
];
const _findIf = astMatcher('if (__any) {__anl}');

const _auConfigureDeps = depFinder(
  // forgive users don't know about PLATFORM.moduleName
  '__any.plugin(__dep)',
  '__any.plugin(__dep, __any)',

  '__any.feature(__dep)',
  '__any.feature(__dep, __any)',

  '__any.globalResources(__dep)',
  '__any.globalResources([__deps])'
);

const _methodCall = astMatcher('__any.__any_method()');
const auConfigModuleNames = {
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

// https://github.com/aurelia/framework/pull/851
const auDevLogWithOptionalLevel = astMatcher('__any.developmentLogging(__any)');

const auConfigureDepFinder = function(contents) {
  // the way to find configure function is not waterproof
  let configFunc;

  _checkConfigureFunc.find(check => {
    let m = check(contents);
    // only want single configure func
    if (m && m.length === 1) {
      configFunc = m[0];
      return true; // break find loop
    }
  });

  if (!configFunc) return [];

  let auVar = configFunc.match.auVar.name;

  let configureFuncBody = {
    type: 'BlockStatement',
    // The matched body is an array, wrap them under single node,
    // so that I don't need to call forEach to deal with them.
    body: configFunc.match.body
  };

  let isLikelyAureliaConfigFile;
  let isAureliaMainFile = !!(astMatcher(`${auVar}.start()`)(contents));

  if (!isAureliaMainFile) {
    // an aurelia plugin entry file is likely to call one of
    // 'globalResources', 'feature', or 'plugin'
    isLikelyAureliaConfigFile = !!(astMatcher(`${auVar}.globalResources(__anl)`)(contents) ||
                                   astMatcher(`${auVar}.feature(__anl)`)(contents) ||
                                   astMatcher(`${auVar}.plugin(__anl)`)(contents));
  }

  let deps = new Set();
  let add = _add.bind(deps);

  if (isAureliaMainFile) {
    let match = _methodCall(configureFuncBody);
    if (match) {
      // track aurelia dependency based on user configuration.
      match.forEach(m => {
        let methodName = m.match.method.name;
        let _deps = auConfigModuleNames[methodName];
        if (_deps) _deps.forEach(d => add(d));
      });
    }

    if (auDevLogWithOptionalLevel(configureFuncBody)) {
      auConfigModuleNames.developmentLogging.forEach(d => add(d));
    }
  }

  if (isAureliaMainFile || isLikelyAureliaConfigFile) {
    _auConfigureDeps(configureFuncBody).forEach(d => add(d));
  }

  // Need to ignore dep behind condition
  //
  // for instance:
  //   if (environment.testing) {
  //      aurelia.use.plugin('aurelia-testing');
  //   }
  let allIfs = _findIf(configureFuncBody);
  if (allIfs) {
    allIfs.forEach(m => {
      let volatileDeps = _auConfigureDeps(m.node);
      volatileDeps.forEach(d => deps.delete(d));
    });
  }

  return deps;
};

const inlineViewExtract = depFinder(
  // for babel compiled code
  '(__any, __any.inlineView)(__dep)',
  '(__any, __any.inlineView)(__dep, __any)',
  // for TypeScript compiled code
  '__any.inlineView(__dep)',
  '__any.inlineView(__dep, __any)'
);

const auInlineViewDepsFinder = function(contents) {
  let match = inlineViewExtract(contents);
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

  deps.forEach(d => {
    if (!d) return;
    // ignore string interpolation
    // <compose view-model="./foo/${bar}"></compose>
    if (d.indexOf('$') >= 0) return;

    let clean = d.trim();
    // strip off leading /
    if (clean[0] === '/') clean = clean.slice(1);

    // There is some npm package call itself like "popper.js",
    // cannot strip .js from it.
    if (!isPackageName(clean)) {
      // strip off tailing .js
      clean = clean.replace(/\.js$/ig, '');
    }

    this.add(clean);
  });
}

function isPackageName(id) {
  if (id.startsWith('.')) return false;
  const parts = id.split('/');
  // package name, or scope package name
  return parts.length === 1 || (parts.length === 2 && parts[0].startsWith('@'));
}

export function findJsDeps(filename, contents, mock) {
  let _readFile = (mock && mock.readFile) || fsReadFile;
  let deps = new Set();
  let add = _add.bind(deps);

  // for all following static analysis,
  // only parse once for efficiency
  let parsed = ensureParsed(contents);

  // aurelia dependencies PLATFORM.moduleName and some others
  add(auJsDepFinder(parsed));

  // aurelia deps in configure func without PLATFORM.moduleName
  add(auConfigureDepFinder(parsed));

  // aurelia deps in inlineView template
  add(auInlineViewDepsFinder(parsed));

  // aurelia view convention, try foo.html for every foo.js
  let {parts} = parse(filename);
  parts[parts.length - 1] = parts[parts.length - 1].replace(/\.js$/, '.html');
  let htmlPair = parts.join('/');
  let localHtmlPair = parts[parts.length - 1];

  return _readFile(htmlPair).then(
    () => {
      // got html file
      add('./' + localHtmlPair);
    },
    () => {}
  ).then(() => Array.from(deps));
}

export function findHtmlDeps(filename, contents) {
  let deps = new Set();
  let add = _add.bind(deps);

  let parser = new htmlparser.Parser({
    onopentag: function(name, attrs) {
      // <require from="dep"></require>
      if (name === 'require' && attrs.from) {
        add(attrs.from);
      // <compose view-model="vm" view="view"></compose>
      // <any as-element="compose" view-model="vm" view="view"></any>
      } else if (name === 'compose' || attrs['as-element'] === 'compose') {
        add([attrs['view-model'], attrs.view]);
      // <router-view layout-view-model="lvm" layout-view="ly"></router-view>
      // <any as-element === 'router-view' layout-view-model="lvm" layout-view="ly"></any>
      } else if (name === 'router-view' || attrs['as-element'] === 'router-view') {
        add([attrs['layout-view-model'], attrs['layout-view']]);
      }
    }
  });
  parser.write(contents);
  parser.end();

  return Array.from(deps);
}

export default function(filename, contents, mock) {
  let _ext = ext(filename);

  if (_ext === '.js') {
    return findJsDeps(filename, contents, mock);
  } else if (_ext === '.html' || _ext === '.htm') {
    return findHtmlDeps(filename, contents);
  }

  return [];
}
