/**
 * @license Copyright 2014 Mikol Graves.
 * Available under a Creative Commons Attribution 4.0 International License.
 * See http://creativecommons.org/licenses/by/4.0/ for details.
 */

(function (global, TypeError, undefined) {
  // --------------------------------------------------------------------------
  // DOM Runtime Implementation

  /**
   * The directory from which unqualified (i.e., top-level and relative) module
   * IDs will be resolved.
   *
   * @type {string}
   * @private
   */
  var wd = location.href.split('/').slice(0, -1).join('/');

  /**
   * The entry point into the web page’s document object model.
   *
   * @type {HTMLDocument}
   * @private
   */
  var dom = document;

  /**
   * The first <script> element in a browser context, before which module
   * <script> elements will be inserted to load their source code.
   *
   * @type {HTMLScriptElement}
   * @private
   */
  var sibling = dom.getElementsByTagName('script')[0];

  /**
   * Loads module `id` and executes `callback` when it is ready.
   *
   * @param {!string} id The normalized identifier of the module to load.
   * @param {string=} opt_fallbackId The unmodified identifier.
   * @param {Function=} opt_callback The function that will be executed when
   *     the module is loaded.
   *
   * @private
   */
  function loader(ids, opt_callback) {
    var el = dom.createElement('script');
    var url = ids.fqid + (ids.fqid.match(/\.js$/) ? '' : '.js');
    
    el.charset = 'utf-8';
    el.async = true;
    el.src = url;
    el.onload = function () {
      setTimeout(function () {
        el.parentNode.removeChild(el);
        el = null;
      }, 0);

      opt_callback && opt_callback(ids.normalized);
    }

    sibling.parentNode.insertBefore(el, sibling);
  };

  /**
   * Exports the AMD API to the global scope and bootstraps the `data-main`
   * script, if any.
   *
   * When specified, the `data-main` script loads asynchronously. This is only
   * intended to be used when the page has exactly one entry point. There is
   * no guarantee that the `data-main` script will finish executing before
   * later scripts in the same page are loaded and executed.
   *
   * @param {!Function} require The AMD module loading function to export.
   * @param {!Function} define The AMD module defining function to export.
   *
   * @private
   */
  function publish(require, define) {
    global.define = define;
    global.require = require;

    var els = dom.getElementsByTagName('script');
    for (var x = 0, n = els.length, el; x < n && (el = els[x]); ++x) {
      if (el.hasAttribute('data-main')) {
        loader(el.getAttribute('data-main'));
        break;
      }
    }
  }

(function () {
  // --------------------------------------------------------------------------
  // Local Constants

  /**
   * Matches absolute URLs.
   *
   * @type {RegExp}
   * @private
   */
  var ABSOLUTE_PATH_RE = /^(\/\/?|https?:\/\/|file:\/\/\/)(.*)/;

  /**
   * A shorcut for calling the `Array.prototype.splice` method.
   *
   * @type {Function}
   * @private
   */
  var SPLICE = Array.prototype.splice;

  /**
   * Matches JavaScript end-of-line and block comments.
   *
   * @type {RegExp}
   * @private
   */
  var COMMENT_RE = /(?:\/\*[\s\S]*?\*\/|\/\/.*)(?:[\n\r])*/g;

  /**
   * Free variable names expected by CommonJS modules.
   *
   * @type {Array.<string>}
   * @private
   */
  var COMMON_JS_DEPENDENCIES = [ 'require', 'exports', 'module' ];

  /**
   * A shorcut for calling the `Object.prototype.toString` method.
   *
   * @type {Function}
   * @private
   */
  var TO_STRING = Object.prototype.toString;

  /**
   * Matches relative AMD module IDs.
   *
   * @type {RegExp}
   * @private
   */
  var RELATIVE_PATH_RE = /^\.{1,2}\//;

  /**
   * Extracts `require(...)` calls from moodule source code.
   *
   * @type {RegExp}
   * @private
   */
  var REQUIRE_RE = /[^.]\s*require\s*?\(\s*(['"])(.*?[^\\])(?:\1)\s*\)*/g;

  // --------------------------------------------------------------------------
  // Local Variables

  /**
   * A map from module IDs aliased via the `paths` Common Config variable to
   * their corresponding normalized module IDs.
   *
   * @type {Object.<string, string>}
   * @private
   */
  var aliases = {};

  /**
   * Modules indexed herein have at least been partially defined.
   *
   * @type {Object.<string, *>}
   * @private
   */
  var cache = {};

  /**
   * Modules indexed herein have handlers waiting for the module to load
   * (i.e., to have been partially defined and added to `cache`).
   *
   * @type {Object.<string, *>}
   * @private
   */
  var listeners = {};

  /**
   * Modules indexed herein are being loaded.
   *
   * @type {Object.<string, *>}
   * @private
   */
  var loading = {};

  // --------------------------------------------------------------------------
  // Common Config Variables

  // See http://goo.gl/iymjix for more information.

  /**
   * The root used for relative ID and Common Config path resolutions.
   *
   * @type {string}
   * @private
   */
  var baseUrl = '.';

  /**
   * Defines aliases (module ID prefixes) for path values.
   *
   * @type {Object.<string, string>}
   * @private
   */
  var paths;

  /**
   * Defines dependencies, exports, and factory functions for non-AMD scripts.
   *
   * @type {(Array.<string>|Object.<string, (Array.<string>|string|Function)>)}
   * @private
   */
  var shim;

  // --------------------------------------------------------------------------
  // Asynchronous Module Definition (AMD) API

  // Module definition typically proceeds as follows:
  //
  // (1) A module is requested -- for example, via `require(['module'], ...)`.
  // (2) The module is loaded via `load('module', ...)`.
  // (3) The script source for the module is loaded -- for example, by
  //     inserting a <script> element into the DOM.
  // (4) The module’s `define()` call is executed, producing a list of
  //     dependencies and a method that, when called, will set up the module’s
  //     internals and export its public API.
  //
  // Note: At this point, we often do not know what the module’s ID is. Modules
  // are loaded asynchronously so the order in which each module’s `define()`
  // call is executed won’t be deterministic.
  //
  // (5) The onLoad() handler for #3 runs, marrying the ID, which is now known
  //     for the module that just finished loading, with the dependencies and
  //     API-exporting method from #4.
  // (6) At this point, if there are any unmet dependencies, we start over at
  //     #2 for each dependent module. Otherwise, we invoke the API-exporting
  //     method with a list of the specified (and now fulfilled) dependencies.
  //
  // In some cases, we know the module’s ID during #4 and we can short-circuit
  // this process. At various points, we will patch up dependencies in order to
  // reconcile with CommonJS modules and to achieve certain semantics specified
  // by the AMD standard (for example, to provide a local `require()` for each
  // module that depends on one).

  /**
   * Registers the module named by `opt_id` and initialized by `factory` so
   * that it can be referenced by other modules.
   *
   * @param {string=} opt_id A valid AMD module ID.
   * @param {Array.<string>=} opt_dependencies A list of valid AMD
   *     module IDs on which the registered module depends.
   * @param {!Object} factory Either (a) the function that will be executed
   *     to instantiate the module or (b) the object that will be assigned as
   *     the exported value of the module.
   *
   * @public
   */
  function define(opt_id, opt_dependencies, factory) {
    // ------------------------------------------------------------------------
    // Overloading

    if (arguments.length === 1) {
      factory = arguments[0];
      opt_id = undefined;
      opt_dependencies = undefined;
    } else if (arguments.length === 2) {
      factory = arguments[1];

      if (isString(arguments[0])) {
        opt_dependencies = undefined;
      } else if (isArray(arguments[0])) {
        opt_dependencies = arguments[0];
        opt_id = undefined;
      }
    }

    // ------------------------------------------------------------------------
    // Validation

    if (opt_id) {
      if (!isString(opt_id)) {
        throw TypeError('@param opt_id must be a module ID string.');
      }

      if (RELATIVE_PATH_RE.test(opt_id)) {
        throw TypeError('@param opt_id cannot be relative.');
      }
    }

    if (opt_dependencies && !isArray(opt_dependencies)) {
      throw TypeError(
          '@param opt_dependencies must be an array of module ID strings.');
    }

    if (!isObject(factory)) {
      throw TypeError('@param factory must be a function or an object.');
    }

    // ------------------------------------------------------------------------
    // Dependency Discovery

    var dependencies = opt_dependencies || [];
    var fn = isFunction(factory) ? factory : function () { return factory; };
    var indexOfRequire = -1;

    if (dependencies.length === 0 && fn.length > 0) {
      dependencies = COMMON_JS_DEPENDENCIES.slice(0, fn.length);
      indexOfRequire = 0;
    } else {
      indexOfRequire = dependencies.indexOf('require');
    }

    if (indexOfRequire > -1) {
      var match;
      var src = fn.toString().replace(COMMENT_RE, '');
      var map = {};

      // Track the dependencies we discover to avoid duplicates.
      dependencies.forEach(function (dependency, index) {
        map[dependency] = true;
      });

      REQUIRE_RE.lastIndex = 0;
      while ((match = REQUIRE_RE.exec(src))) {
        var dependency = match[2];
        if (!map[dependency]) {
          dependencies.push(dependency);
          map[dependency] = true;
        }
      }
    };

    // ------------------------------------------------------------------------
    // Definition

    var module = new Module(opt_id, dependencies, fn);

    if (opt_id && !loading[opt_id]) {
      setTimeout(function () {
        cache[opt_id] = module;
        module.actuate();
      }, 0);
    } else {
      onLoad.module = module;
    }
  }

  define.amd = {};

  /**
   * Either (a) synchronously obtains a reference to one `dependencies`
   * specified as a string literal AMD module ID or (b) asynchronously loads
   * multiple resources when `dependencies` is an array of string literals,
   * executing `opt_callback` after all of the required resources have finished
   * loading.
   *
   * @param {!(string|Array.<string>)} dependencies Either (a) one valid
   *     string literal AMD module ID or (b) an array of such IDs.
   * @param {Function=} opt_callback The function that should be executed
   *     asynchronously after an array of `dependencies` resources have
   *     finished loading.
   *
   * @return {(Object|undefined)} `Object` when a single resource is required
   *     and synchronously obtained; `undefined` otherwise.
   *
   * @public
   */
  function require(dependencies, opt_callback) {
    if (isArray(dependencies) && isFunction(opt_callback)) {
      new Module(undefined, dependencies, opt_callback).actuate();
    } else if (isString(dependencies)) {
      var module = cache[alias(dependencies, dirname(this.id))];
      return module.exports;
    } else {
      throw TypeError('require() called with invalid arguments.');
    }
  }

  /**
   * Implements the `baseUrl`, basic `paths` (i.e., without failover), and
   * `shim` AMD Common Config API. See http://goo.gl/iymjix for more
   * information.
   *
   * @param {!Object.<string, *>} object An AMD Common Config object.
   */
  require.config = function config(object) {
    baseUrl = object.baseUrl || baseUrl;
    paths = object.paths || paths;
    shim = object.shim || shim;
  };

  /**
   * Converts a string including an extension to a URL relative to the module
   * from which it is called.
   *
   * @param {!string} resourceId The string to convert to a URL.
   *
   * @return {!string} The URL corresponding to `resourceId`, relative to the
   *     current module context.
   *
   * @public
   */
  require.toUrl = function (resourceId) {
    return alias(resourceId, dirname(this.id));
  };

  // --------------------------------------------------------------------------
  // Module
  
  /**
   * An AMD module, plain old script, or other resource loaded via the AMD API.
   *
   * @param {string=} id A valid AMD module ID.
   * @param {Array.<string>=} dependencies A list of valid AMD module IDs on
   *     which this module depends.
   * @param {Function=} factory The function that instantiates this module.
   */
  function Module(id, dependencies, factory) {
    this.id = id;
    this.dependencies = dependencies || [];
    this.factory = factory;

    this.listeners = [];
    this.exports = {};
    this.modules = new Array(this.dependencies.length);

    this.defined = false;
  }

  /** @private */
  var P = Module.prototype;

  /**
   * Normalizes and loads this module’s dependencies.
   */
  P.actuate = function actuate() {
    if (this.defined) {
      return;
    }

    var dependencies = this.dependencies;
    var n = dependencies.length;

    if (n) {
      for (var x = 0; x < n; ++x) {
        var dependency = dependencies[x];

        if (COMMON_JS_DEPENDENCIES.indexOf(dependency) > -1) {
          setTimeout(makeCommonJsDependency.bind(this, dependency), 0);
        } else {
          dependency = dependencies[x] =
            alias(dependencies[x], dirname(this.id));
          this.load(dependency);
        }
      }
    } else {
      setTimeout(tie(P.define, this), 0);
    }
  };

  /**
   * Loads `dependency`; if necessary, after creating a shim for it.
   *
   * @param {!string} dependency The ID of the module to load.
   */
  P.load = function loadDependency(dependency) {
    var dependencies = [];
    var adapter = shim && shim[dependency];

    if (adapter) {
      if (isArray(adapter)) {
        spliceTail(dependencies, adapter);
      } else if (adapter.deps) {
        spliceTail(dependencies, adapter.deps);
      }
    }

    if (dependencies.length) {
      var module = new Module(dependency, dependencies);
      module.shimmed = dependency;
      module.addDefineListener(tie(P.removeDependency, this));
      cache[dependency] = module;
      module.actuate();
    } else {
      var ids = { fqid: fqid(dependency), normalized: dependency };
      load(ids, tie(onDependencyLoaded, this));
    }
  };

  /**
   * Generates one of the three standard CommonJS free variables (`require`,
   * `exports`, or `module`) and installs it in this module’s list of fulfilled
   * dependencies;
   *
   * @param {!string} dependency The name of the CommonJS free variable to
   *     generate.
   */
  function makeCommonJsDependency(dependency) {
    var module, output, factory = function () {
      return output;
    };

    if (dependency === 'require') {
      // XXX: tie() does not work in these cases.
      output = require.bind(this);
      output.toUrl = require.toUrl.bind(this);
    } else if (dependency === 'exports') {
      output = this.exports;
    } else if (dependency === 'module') {
      output = this;
    }

    module = new Module(dependency, [], factory);
    module.define();
    this.removeDependency(module);
  };

  /**
   * Registers a callback with dependency `module` to be executed after it has
   * been fully defined and is ready to be used.
   *
   * @param {Error=} error The exception thrown, if any, when the dependency
   *     fails to load.
   * @param {Module=} module The partially defined module with which to
   *     register a callback.
   */
  function onDependencyLoaded(error, module) {
    if (error) {
      console.error('Failed to load dependency.', error);
    } else {
      module.addDefineListener(tie(P.removeDependency, this));
    }
  };

  /**
   * Registers a callback with this module that will be executed after the
   * module has been fully defined.
   *
   * @param {!Function} callback The function to execute after this module has
   *     been fully defined.
   */
  P.addDefineListener = function addDefineListener(callback) {
    if (!isFunction(callback)) {
      throw TypeError('@param callback is not a function.');
    }

    if (this.defined) {
      callback(this);
    } else {
      this.listeners.push(callback);
    }
  };

  /**
   * Determines if this module’s dependencies have been fulfilled with the
   * exception of `module`.
   *
   * @param {!Module} module The module to look for.
   *
   * @return {!boolean} `true` if this module is waiting exclusively on
   *     `module`; `false` if this module has other unmet dependencies.
   */
  P.isBlockedBy = function isBlockedBy(module) {
    if (this.defined) {
      return false;
    }

    var dependencies = this.dependencies;
    var modules = this.modules;

    for (var x = 0, n = modules.length; x < n; ++x) {
      if (!modules[x]) {
        if (dependencies[x] === module.id) {
          continue;
        }

        return false;
      }
    }

    return dependencies.length > 0;
  };

  /**
   * Registers `module` as a dependency that has been met; if all dependencies
   * have been met, this module will be fully defined as a result.
   *
   * @param {!Module} module The dependency that has been met.
   */
  P.removeDependency = function removeDependency(module) {
    var dependencies = this.dependencies;
    var modules = this.modules;
    var unmet = 0;
    var unmetDependency;

    for (var x = 0, n = dependencies.length; x < n; ++x) {
      var dependency = dependencies[x];

      if (module.id === dependency) {
        modules[x] = module;
      }

      if (!modules[x]) {
        ++unmet;
        unmetDependency = cache[dependency];
      }
    }

    if (unmet === 0) {
      if (this.shimmed) {
        if (this.shimmed === this.id) {
          var ids = { fqid: fqid(this.id), normalized: this.id };
          loader(ids, tie(P.define, this));
          this.shimmed = true;
        }
      } else {
        this.define();
      }
    } else if (unmet === 1) {
      if (unmetDependency && unmetDependency.isBlockedBy(this)) {
        unmetDependency.removeDependency(this);
      }
    }
  };

  /**
   * Completes this module’s definition and notifies any registered listeners
   * that this module is ready to be used.
   */
  P.define = function define() {
    if (this.defined) {
      return;
    }

    var adapter = shim && shim[this.id];
    var factory = adapter && adapter.init ? adapter.init : this.factory;
    var dependencies = this.dependencies;
    var modules = this.modules;
    var callbacks = this.listeners;
    var argc = modules.length;
    var argv = new Array(argc);

    for (var x = 0; x < argc; ++x) {
      argv[x] = modules[x].exports;
    }

    var exports = factory && factory.apply(undefined, argv);
    if (exports !== undefined) {
      this.exports = exports;
    } else if (adapter && adapter.exports) {
      this.exports = resolve(adapter.exports);
    }

    // this.actuate = this.isBlockedBy = this.define = NOOP;
    this.defined = true;

    while (callbacks.length) {
      callbacks.pop()(this); // LIFO is important.
    }

    setTimeout(function () {
      while (dependencies.length) {
        dependencies.pop();
      }
      while (modules.length) {
        modules.pop();
      }
    }, 100);
  };

  // --------------------------------------------------------------------------
  // Module Loader

  /**
   * Loads module `id` and executes `callback` when it is ready.
   *
   * @param {!string} id The identifier of the module to load.
   * @param {!Function} callback The function that will be executed when the
   *     module is loaded.
   *
   * @private
   */
  function load(ids, callback) {
    if (!isFunction(callback)) {
      throw TypeError('@param callback is not a function.');
    }

    var normalized = ids.normalized;

    if (cache[normalized]) {
      callback(undefined, cache[normalized]);
      return;
    }

    if (!loading[normalized]) {
      loading[normalized] = true;
      loader(ids, onLoad);
    }

    (listeners[normalized] = listeners[normalized] || []).push(callback);
  };

  /**
   * Continues composing a module after it has been loaded.
   *
   * @param {!string} id The identifier of the module loaded.
   * @param {string=} opt_id The original identifier if it could not be used to
   *     load the module.
   * @param {Object=} opt_exports The exported interface of the module loaded.
   *
   * @private
   */
  function onLoad(id, opt_exports) {
    var module = onLoad.module;
    onLoad.module = null;
    delete loading[id];

    if (module) {
      module.id = module.id || id;
    } else if (opt_exports) {
      module = new Module(id, COMMON_JS_DEPENDENCIES, function () {
        return opt_exports;
      });
    } else {
      module = new Module(id);
    }

    cache[module.id] = module;
    module.actuate();

    var callbacks = listeners[id];
    if (callbacks) {
      while (callbacks.length) {
        setTimeout((function (f) {
          f(undefined, module);
        })(callbacks.shift()), 0);
      }

      delete listeners[id];
    }
  }

  // --------------------------------------------------------------------------
  // Minimal Utilities

  /**
   * Determines if reference `v` is an array.
   *
   * @param {*} v The reference to test.
   *
   * @return {!boolean} `true` if `v` is an array; `false` otherwise.
   *
   * @private
   */
  function isArray(v) {
    return v && TO_STRING.call(v) === '[object Array]';
  }

  /**
   * Determines if reference `v` is a function.
   *
   * @param {*} v The reference to test.
   *
   * @return {!boolean} `true` if `v` is a function; `false` otherwise.
   *
   * @private
   */
  function isFunction(v) {
    return v && typeof v === 'function';
  }

  /**
   * Determines if reference `v` is a non-primitive, non-null object type; not
   * `boolean`, `number`, `string`, `null`, or `undefined`, but any other data
   * type that can be extended dynamically with properties and methods such as
   * the primitive wrappers `Boolean`, `Number`, `String`, as well as built-in
   * types like `Array`, `Date`, `Function`, `Object`, `RegExp`, and others.
   *
   * @param {*} v The reference to test.
   *
   * @return {!boolean} `true` if `v` is an object; `false` otherwise.
   *
   * @private
   */
  function isObject(v) {
    return v && typeof v === 'object' || typeof v === 'function';
  }

  /**
   * Determines if reference `v` is a string.
   *
   * @param {*} v The reference to test.
   *
   * @return {!boolean} `true` if `v` is a string; `false` otherwise.
   *
   * @private
   */
  function isString(v) {
    return typeof v === 'string' || TO_STRING.call(v) === '[object String]';
  }

  /**
   * Looks up `id` in the `paths` Common Config variable, producing the
   * corresponding canonical (that is, top-level or absolute) identifier; if
   * `id` is not an alias in `paths`, then it’s canonical form will be
   * produced as if `normalize(id, opt_relativeTo)` were called directly.
   *
   * @param {!string} id The AMD module ID to look up.
   * @param {string=} opt_relativeTo The pathname from which a relative module
   *     ID (that is, whose first term is `'.'` or `'..'`) should be resolved.
   *
   * @return {!string} A canonical (that is, top-level or absolute) module
   *     identifier.
   * 
   * @see #normalize
   *
   * @private
   */
  function alias(id, opt_relativeTo) {
    if (paths) {
      var pathsBySpecificity = Object.keys(paths).sort().reverse();

      for (var x = 0, n = pathsBySpecificity.length; x < n; ++x) {
        var p = pathsBySpecificity[x];

        if (id.indexOf(p) === 0) {
          var match = ABSOLUTE_PATH_RE.exec(paths[p]);
          var protocol = match ? match[1] : '';
          var terms = (match ? match[2] : paths[p]).split('/');

          if (id.length > p.length) {
            spliceTail(terms, id.substr(p.length).split('/'));
          }

          var result = normalize(terms.join('/'));
          aliases[result] = id;
          
          return result;
        }
      }
    }

    return normalize(id, opt_relativeTo);
  }

  /**
   * Resolves `id` to its parent directory pathname.
   *
   * @param {!string} id A canonical (that is, top-level or absolute) module
   *     identifier.
   *
   * @return {!string} The parent directory pathname of `id`.
   *
   * @private
   */
  function dirname(id) {
    if (!id) {
      return;
    }
    
    return (aliases[id] || id).split('/').slice(0, -1).join('/');
  }

  /**
   * Resolves `id`, removing redundant path delimiters (`'/'`), current
   * directory indirections (`'.'`), and parent directory indirections (`'..'`)
   * along with their corresponding directory names to produce a fully
   * qualified identifier suitable for use in a URL.
   *
   * @param {!string} id The AMD module ID to interpolate.
   * @param {string=} opt_relativeTo The pathname from which a relative module
   *     ID (that is, whose first term is `'.'` or `'..'`) should be resolved.
   *
   * @return {!string} A fully qualified pathname suitable for use in a URL.
   *
   * @private
   */
  function fqid(id, opt_relativeTo) {
    var match = ABSOLUTE_PATH_RE.exec(id);
    var protocol = match ? match[1] : '';
  
    if (match) {
      return protocol + normalizeTerms(match[2].split('/')).join('/');
    }

    if (RELATIVE_PATH_RE.test(id)) {
      if (!ABSOLUTE_PATH_RE.test(opt_relativeTo)) {
        opt_relativeTo = (wd + '/' + baseUrl) + '/' + (opt_relativeTo || '');
      }
    } else {
      opt_relativeTo = (wd + '/' + baseUrl);
    }

    match = ABSOLUTE_PATH_RE.exec(opt_relativeTo);
    protocol = match ? match[1] : '';
    baseline = match ? match[2] : '';
    
    return protocol +
      normalizeTerms((baseline + '/' + id).split('/')).join('/');
  }

  /**
   * Resolves `id`, removing redundant path delimiters (`'/'`), current
   * directory indirections (`'.'`), and parent directory indirections (`'..'`)
   * along with their corresponding directory names to produce a canonical
   * identifier.
   *
   * @param {!string} id The AMD module ID to interpolate.
   * @param {string=} opt_relativeTo The pathname from which a relative module
   *     ID (that is, whose first term is `'.'` or `'..'`) should be resolved.
   *
   * @return {!string} A canonical (that is, top-level or absolute) module
   *     identifier.
   *
   * @private
   */
  function normalize(id, opt_relativeTo) {
    var match = ABSOLUTE_PATH_RE.exec(wd + '/' + baseUrl);
    var protocol = match ? match[1] : '';
    var baseline = protocol + normalizeTerms(match[2].split('/')).join('/');
    var p = fqid(id, opt_relativeTo); 

    if (p.indexOf(baseline) === 0) {
      return p.substr(baseline.length + 1);
    }
    
    return p;
  }

  /**
   * Cleans up a list of identifier terms, removing empty terms (`''`), current
   * directory (`'.'`) indirections, and parent directory (`'..'`) indirections
   * along with their corresponding directory names. For example:
   * `['foo', 'bar', '', 'baz', '.', 'asdf', 'quux', '..']` becomes
   * `['foo', 'bar', 'baz', 'asdf']`.
   *
   * @param {Array.<string>} terms A list of identifiers and path indirections
   *     (`'.'` or `'..'`).
   *
   * @return {Array.<string>} The remaining identifiers after interoplating any
   *     `'.'` or `'..'` indirections and removing any empty terms.
   *
   * @private
   */
  function normalizeTerms(terms) {
    var normalized = [];

    for (var x = 0, n = terms.length; x < n; ++x) {
      var term = terms[x];

      if (term === '.' || term === '') {
        continue;
      } else if (term === '..') {
        normalized.pop();
      } else {
        normalized.push(term);
      }
    }

    return normalized;
  }

  /**
   * Converts a dotted identifier (for example, `'some.thing'`) into the
   * corresponding value from the global namespace.
   *
   * @param {!string} identifier A dotted global property name.
   *
   * @return {*} The corresponding value from the global namespace.
   *
   * @private
   */
  function resolve(identifier) {
    var terms = identifier.split('.');
    var node = global;

    for (var x = 0, n = terms.length; x < n && node; ++x) {
      node = node[terms[x]];
    }

    return node;
  }

  /**
   * Adds the elements of array `b` to to the beginning of array `a`, modifying
   * `a` in-place.
   *
   * @param {!Array.<*>} a The array to modify.
   * @param {!Array.<*>} b The array whose values will be added to `a`.
   *
   * @private
   */
  function spliceHead(a, b) {
    SPLICE.bind(a, 0, 0).apply(undefined, b);
  }

  /**
   * Adds the elements of array `b` to to the end of array `a`, modifying `a`
   * in-place.
   *
   * @param {!Array.<*>} a The array to modify.
   * @param {!Array.<*>} b The array whose values will be added to `a`.
   *
   * @private
   */
  function spliceTail(a, b) {
    SPLICE.bind(a, a.length, 0).apply(undefined, b);
  }

  /**
   * Creates a new function that wraps `fn` and, when called, has its `this`
   * keyword set to the provided `context`.
   *
   * @param {!Function} fn The function to wrap.
   * @param {*} context The value to use as the `this` keyword when executing
   *     the wrapped function.
   *
   * @return {!Function} The new function.
   *
   * @private
   */
  function tie(fn, context) {
    return function () {
      fn.apply(context, SPLICE.call(arguments, 0));
    };
  }

  publish(require, define);
})();

})(this, TypeError);
