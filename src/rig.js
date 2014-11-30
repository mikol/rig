/**
 * @license Copyright 2014 Mikol Graves.
 * Available under a Creative Commons Attribution 4.0 International License.
 * See http://creativecommons.org/licenses/by/4.0/ for details.
 */

try {
  // Running in a local (command line) execution context.
  // Parse out parameters and pair them with their corresponding arguments.
  (function (ctx, a, c) {
    var parameters = /function[^(]*?\((.*?)\)/.exec(c)[1].split(/,\s*?/)
      , arguments = Array.prototype.slice.call(a)
      ;

    ctx['rig\bgspace'] = global;
    while (parameters.length) {
      if (parameters[0]) {
        ctx[parameters.shift().trim()] = arguments.shift();
      } else {
        parameters.shift();
      }
    }
  })(this, arguments, arguments.callee);
} catch (e) {
  ;
}

(function (ctx) {
  var gspace = ctx['rig\bgspace']
    , isCommandLine = true
    , baseUrl
    , paths
    ;

  if (!gspace) {
    isCommandLine = false;
    gspace = ctx;
    ctx = {};
  }

  // -------------------------------------------------------------------------
  // Asynchronous Module Definition (AMD) API

  /**
   * Registers the module named by {@code opt_id} and assembled by
   * {@code exporter} so that it can be referenced by other modules.
   *
   * @param {string=} opt_id A valid AMD module ID.
   * @param {Array.<string>=} opt_dependencies A list of valid AMD
   *     module IDs on which the registered module depends.
   * @param {!Object} exporter Either (a) the function that will be executed
   *     to instantiate the module or (b) the object that will be assigned as
   *     the exported value of the module.
   *
   * @public
   */
  function define(opt_id, opt_dependencies, exporter) {
    if (arguments.length === 1) {
      exporter = arguments[0];
      opt_id = null;
      opt_dependencies = null;
    } else if (arguments.length === 2) {
      exporter = arguments[1];

      if (isString(arguments[0])) {
        opt_dependencies = null;
      } else if (isArray(arguments[0])) {
        opt_dependencies = arguments[0];
        opt_id = null;
      }
    }

    if (opt_id) {
      if (!isString(opt_id)) {
        throw new TypeError('@param opt_id must be a module ID string.');
      }

      var id = new AmdId(opt_id);

      if (id.isRelative()) {
        throw new TypeError('@param opt_id cannot be relative.');
      }
    }

    if (opt_dependencies) {
      if (!isArray(opt_dependencies)) {
        throw new TypeError('@param opt_dependencies must be an array of '
          + 'module ID strings.');
      }
    }

    if (!isObject(exporter)) {
      throw new TypeError('@param exporter must be an object.');
    }

    AmdLoader.addPartial(exporter, opt_dependencies, opt_id);
  }

  /**
   * Designates that {@code define} conforms with the AMD API, helping to avoid
   * conflict with other possible {@code define} functions that do not.
   *
   * @public
   */
  define['amd'] = {};

  /**
   * Either (a) synchronously obtains a reference to one {@code dependency}
   * specified as a string literal AMD module ID or (b) asynchronously loads
   * multiple resources when {@code dependency} is an array of string literals,
   * executing {@code opt_callback} after all of the required resources have
   * finished loading.
   *
   * @param {!(string|Array.<string>)} dependency Either (a) one valid string
   *     literal AMD module ID or (b) an array of such IDs.
   * @param {Function=} opt_callback The function that should be executed
   *     asynchronously after an array of {@code dependency} resources have
   *     finished loading.
   *
   * @return {(undefined|Object)} {@code Object} when a single resource is
   *     required and synchronously obtained; {@code undefined} otherwise.
   *
   * @public
   */
  function require(dependency, opt_callback) {
    if (isArray(dependency)) {
      requireAsync(dependency, opt_callback);
    } else {
      return requireSync(dependency);
    }
  }

  require.config = function (object) {
    baseUrl = object.baseUrl;
    paths = object.paths;
  };

  /**
   * Converts a string including a module ID and an extension to a URL path.
   *
   * @param {string} resourceId The string to convert to a URL path.
   *
   * @return {string} The URL path corresponding to {@code resourceId}.
   *
   * @public
   */
  require.toUrl = function (resourceId) {
    return new AmdId(resourceId).toUri();
  };

  // -------------------------------------------------------------------------
  // AMD API Helpers

  // ---------------------------------------------------------------
  // AMD Require Implementations

  /**
   * Asynchronously loads the resources specified by {@code dependencies} and
   * executes {@code callback} after they have all finished loading.
   *
   * @param {!Array.<string>} dependencies A list of valid string literal AMD
   *     module IDs to be loaded asynchronously.
   * @param {!Function} callback The function that should be executed after
   *     all of the resources specified by {@code dependencies} have finished
   *     loading.
   *
   * @private
   */
  function requireAsync(dependencies, callback) {
    var x = 0
      , n = dependencies.length
      , skipped = 0
      ;

    function fn() {
      if (n === 0) {
        callback.apply(null, AmdLoader.getModules(dependencies));
      }

      --n;
    }

    for (; x < n; ++x) {
      var id = new AmdId(dependencies[x]);
      if (AmdLoader.getModule(id)) {
        ++skipped;
        continue;
      }

      AmdLoader.load(id, fn);
    }

    n -= skipped;

    fn();
  }

  /**
   * Synchronously obtains a reference to the resource specified by
   * {@code dependency}.
   *
   * @param {!string} dependency A valid string literal AMD module ID.
   *
   * @return {Object} The exported interface of the required module.
   *
   * @throws {ReferenceError} If the required module is not defined.
   *
   * @private
   */
  var requireSync = isCommandLine
    ? ctx.require
    : function requireSync(dependency) {
        try  {
          var id = new AmdId(dependency);
        } catch (ex) {
          throw new TypeError('@param dependency must be a valid ' +
              'module ID string.');
        }

        var module = AmdLoader.getModule(id);

        if (!module) {
          throw new ReferenceError('Module "' + dependency +
              '" is not defined.');
        }

        return module;
      };

  // ---------------------------------------------------------------
  // AMD Module Loader

  /** @private */
  var AmdLoader = {};

  (function (exports) {
    var dom = gspace.document
      , sibling = dom && dom.getElementsByTagName('script')[0]
      , cache = { rig: require, require: require, exports: true, module: true }
      , queue = []
      , queued = {}
      ;

    /**
     * Loads module {@code id} and executes {@code callback} when it is ready.
     *
     * @param {!AmdId} id The ID of the module to load.
     * @param {!Function} callback The function that will be executed when the
     *     module is ready.
     *
     * @public
     */
    var load = isCommandLine
      ? function load(id, callback) {
          var fqid = id.isRelative() ? new AmdId(id, process.cwd()) : id;

          process.nextTick(function () {
            cacheModule(id, requireSync(fqid.toString()));
            onLoad(id, callback);
          });
        }
      : function load(id, callback) {
          var el = dom.createElement('script');
          el.charset = 'utf-8';
          el.async = true;
          el.src = id.toUri();
          el.onload = onScriptLoad.bind(null, el, id, callback);

          sibling.parentNode.insertBefore(el, sibling);
        };

    /**
     * Builds a list of dependencies for any queued partially defined modules.
     *
     * @paran {!AmdId} The ID of a partially defined module.
     *
     * @return {!Array.<string>} An array of string literals identifying the
     *     queued modules' dependencies or an empty array if there are none.
     *
     * @private
     */
    function getDependencies(id) {
      var x = 0
        , n = queue.length
        , fqid = isCommandLine && id.isRelative()
            ? new AmdId(id, process.cwd())
            : id
        , relativeTo = fqid.getModname()
        , result = []
        ;

      for (; x < n; ++x) {
        var dependencies = queue[x].getDependencies();
        for (var j = 0, jn = dependencies.length; j < jn; ++j) {
          // This has the (desireable and necessary) side effect of relitivizing
          // the partial's dependencies.
          dependencies[j] = new AmdId(dependencies[j], relativeTo);

          if (result.indexOf(dependencies[j]) === -1) {
            result.push(dependencies[j]);
          }
        }
      }

      return result;
    }

    /**
     * Continues composing a module after it has been loaded.
     *
     * @param {!AmdId} id The ID of the module loaded.
     * @param {!Function} callback The function that will be executed once all
     *     of the queued partial module definitions have been finalized.
     *
     * @private
     */
    function onLoad(id, callback) {
      var partials = queue.slice()
        , dependencies = getDependencies(id)
        ;

      queue = [];

      requireAsync(dependencies, function () {
        while (partials.length > 0) {
          var partial = partials.shift()
            , exporter = partial.exporter
            , uid = isFunction(exporter) ? String(exporter) : ''
            ;

          if (queued[uid]) {
            delete queued[uid];
          }

          partial.finalize(id);
        }

        callback();
      });
    }

    /**
     * Handles load events for scripts dynamically inserted into the DOM.
     *
     * @param {!Element} el A reference to the script tag.
     * @param {!AmdId} id The ID of the module loaded by {@code el}.
     * @param {!Function} callback The function that will be executed once all
     *     of the queued partial module definitions have been finalized.
     *
     * @private
     */
    function onScriptLoad(el, id, callback) {
      onLoad(id, callback);

      el.parentNode.removeChild(el);
      delete el.onload;
      el = null;
    }

    /**
     * Queues a new partially defined module unless the same module has already
     * been defined or is currently being defined.
     *
     * @param {!Object} exporter Either (a) the function that will be executed
     *     to instantiate the module or (b) the object that will be assigned as
     *     the exported value of the module.
     * @param {Array.<(AmdId|string)>=} opt_dependencies A list of valid AMD
     *     module IDs on which the partial module depends.
     * @param {AmdId=} opt_id A valid AMD module ID.
     *
     * @public
     */
    function addPartial(exporter, opt_dependencies, opt_id) {
      var uid = isFunction(exporter) ? String(exporter) : '';

      if (queued[uid] !== undefined || (opt_id && getModule(opt_id))) {
        return;
      }

      if (uid !== '') {
        queued[uid] = true;
      }

      var partial = new AmdPartial(exporter, opt_dependencies);

      if (opt_id) {
        partial.setId(opt_id);
      }

      queue.push(partial);
    }

    /**
     * Adds the exported interface {@code module} to the module cache with key
     * {@code id}.
     *
     * @param {string} id The AMD module ID to use as a key for lookups.
     * @param {Object} module The exported module interface to cache.
     */
    function cacheModule(id, module) {
      if (id) {
        cache[id] = module;
      }
    }

    /**
     * @param {(AmdId|string)} A valid AMD module ID.
     *
     * @return {Object} The module corresponding to the specified {@code id}.
     *
     * @public
     */
    function getModule(id) {
      return cache[new AmdId(id)];
    }

    /**
     * @param {Array.<(AmdId|string)>} A list of valid AMD module IDs.
     *
     * @return {Array.<Object>} An array of modules corresponding to the
     *     specified {@code dependencies}.
     *
     * @public
     */
    function getModules(dependencies) {
      var list = []
        , x = 0
        , n = dependencies.length
        ;

      for (; x < n; ++x) {
        list.push(getModule(dependencies[x]));
      }

      return list;
    }

    exports.load = load;
    exports.addPartial = addPartial;
    exports.cacheModule = cacheModule;
    exports.getModule = getModule;
    exports.getModules = getModules;
  })(AmdLoader);

  // ---------------------------------------------------------------
  // AMD Module ID

  /**
   * A convenient wrapper for a string literal AMD module identifier.
   *
   * @param {!string} value A valid string literal module identifier.
   * @param {string=} opt_relativeTo A valid top-level module identifier.
   *
   * @private
   * @constructor
   */
  function AmdId(value, opt_relativeTo) {
    if (!AmdId.isValid(value)) {
      throw new TypeError('@param value >' + value +
          '< must be a valid, useable AMD module ID string.');
    }

    if (value.indexOf('.') === 0 && opt_relativeTo) {
      try {
        if ((opt_relativeTo = new AmdId(opt_relativeTo)).isRelative()) {
          throw 0;
        }
      } catch (ex) {
        throw new TypeError('@param opt_relativeTo >' + opt_relativeTo +
            '< must be a valid, useable top-level AMD module ID string.');
      }

      this.relativeTo = opt_relativeTo;
    }

    this.value = value;
  }

  subjoin(AmdId, String);

  /**
   * @param {string} s The identfier to validate.
   *
   * @return {boolean} {@code true} If the specified identifer {@code s} can be
   *     used to look up and load an AMD module; {@code false} otherwise.
   *
   * @private
   */
  AmdId.isValid = (function () {
    var invalid = /(?:[^A-Za-z\.\/]|\.{3,})/
      , useable = /[A-Za-z]/
      ;

    return function (s) {
      if (s && isString(s) && !invalid.test(s) && useable.test(s)) {
        return true;
      }

      return false;
    };
  });

  /**
   * @return {string} {@code true} If this AMD module ID must be resolved in
   *     relation to a top-level module ID (that is, if this module ID begins
   *     with {@code '.'} or {@code '..'}); {@code false} otherwise.
   *
   * @public
   */
  AmdId.prototype.isRelative = function () {
    return this.terms
      ? this.terms[0].indexOf('.') === 0
      : this.value.indexOf('.') === 0
      ;
  };

  /**
   * @return {string} The directory portion of this AMD module ID independent
   *     of its URI (for example, {@code '/foo/baz/asdf'} in
   *     {@code '/foo/bar/asdf/quux'}); {@code getModname()} and
   *     {@code getDirname()} will be equal unless the path to the module has
   *     been interpolated with {@code require.confg()}.
   *
   * @public
   */
  AmdId.prototype.getModname = function () {
    if (this.modname === void(0)) {
      this.modname = this.getDirname();
    }

    return this.modname;
  };

  /**
   * @return {string} The directory portion of this AMD module ID's URI (for
   *     example, {@code '/foo/bar/asdf'} in {@code '/foo/bar/asdf/quux'}).
   *
   * @public
   */
  AmdId.prototype.getDirname = function () {
    if (this.dirname === void(0)) {
      this.dirname = this.slice(0, -1).join('/');
    }

    return this.dirname;
  };

  /**
   * @return {string} The last portion of this AMD module ID (for example,
   *     {@code 'quux'} in {@code '/foo/bar/baz/asdf/quux'}).
   *
   * @public
   */
  AmdId.prototype.getBasename = function () {
    if (this.basename === void(0)) {
      this.basename = this.slice(-1)[0];
    }

    return this.basename;
  };

  /**
   * @return {string} The filename extension of this ID if it has one;
   *     {@code ''} otherwise.
   *
   * @public
   */
  AmdId.prototype.getExtension = function () {
    if (this.extension === void(0)) {
      var basename = this.getBasename()
        , index = basename.lastIndexOf('.')
        ;

      this.extension = index > 0 ? basename.slice(index) : '';
    }

    return this.extension;
  };

  /**
   * @return {string} {@code true} If this AMD module ID ends with a filename
   *     extension such as {@code '.js'}; {@code false} otherwise.
   *
   * @public
   */
  AmdId.prototype.hasExtension = function () {
    return !!this.getExtension();
  };

  /**
   * @param {number=} begin The zero-based index at which to begin copying this
   *     module ID's terms; a negative value specifies an offset from the end
   *     of the terms and {@code undefined} is equivalent to index {@code 0}.
   * @param {number=} end The zero-based index up to which this module ID's
   *     terms should be copied (not including the index itself); a negative
   *     value specifies an offset from the end of the terms and if
   *     {@code end} is {@code undefined}, then all of the terms from
   *     {@code begin} to the end of the sequence will be copied.
   *
   * @return {!Array.<string>} A shallow copy of this module ID's normalized
   *     terms from {@code begin} up to (but not including) {@code end} index,
   *     excluding any forward slash delimiters.
   *
   * @private
   */
  AmdId.prototype.slice = function (begin, end) {
    if (!this.terms) {
      this.normalize();
    }

    return this.terms.slice(begin, end);
  }

  /**
   * @return {string} The canonical URI for this AMD module ID.
   *
   * @public
   */
  AmdId.prototype.toUri = function () {
    if (!this.uri) {
      this.uri = this.normalize() + (this.hasExtension() ? '' : '.js');
    }

    return this.uri;
  };

  function normalize(parts) {
    var normalized = []
      , partZero = parts[0] === '..' || parts[0] === '.' || parts[0] === ''
          ? parts[0]
          : null
      ;

    for (var x = 0, n = parts.length; x < n; ++x) {
      var part = parts[x];

      if (part === '.' || part === '') {
        continue;
      } else if (part === '..') {
        normalized.pop();
      } else {
        normalized.push(part);
      }
    }

    // Retain a leading / or ./ or ../ if there is one.
    if (partZero !== null) {
      normalized.unshift(partZero);
    }

    return normalized;
  }

  /**
   * Cleans up this AMD module ID by replacing redundant forward slash
   * delimiters, removing current directory ({@code '.'}) terms, and removing
   * parent directory ({@code '..'}) terms along with their corresponding
   * directory names (for example, {@code '/foo/bar//baz/./asdf/quux/..'}
   * becomes {@code '/foo/bar/baz/asdf'}).
   *
   * @private
   */
  AmdId.prototype.normalize = function () {
    if (!this.normalized) {
      var value = this.value
        , parts = value.split('/')
        ;

      if (paths) {
        var pathsBySpecificity = Object.keys(paths).sort().reverse();

        for (var k = 0, kn = pathsBySpecificity.length; k < kn; ++k) {
          var path = pathsBySpecificity[k];
          if (value.indexOf(path) === 0) {
            var split = paths[path].split('/');

            // This is equivalent to dirname had the path not been
            // interpolated.
            this.modname = normalize(parts).slice(0, -1).join('/');

            if (value.length > path.length) {
              parts = split.concat(value.substr(path.length).split('/'));
            } else {
              parts = split;
            }

            break;
          }
        }
      }

      if (this.isRelative() && this.relativeTo !== void(0)) {
        parts = this.relativeTo.slice().concat(parts);
      }

      if (baseUrl) {
        parts = baseUrl.split('/').concat(parts);
      }

      this.terms = normalize(parts);
      this.normalized = this.terms.join('/');
    }

    return this.normalized;
  };

  /** @inheritDoc */
  AmdId.prototype.toString =
  /** @inheritDoc */
  AmdId.prototype.valueOf = function () {
    return this.normalize();
  };

  // ---------------------------------------------------------------
  // Partial AMD Module Definition

  /**
   * A placeholder for an incompletely initialized module. When the definition
   * can be completed, call {@code AmdPartial.prototype.finalize}.
   *
   * @param {!Object} exporter Either (a) the function that will be executed
   *     to instantiate the module or (b) the object that will be assigned as
   *     the exported value of the module.
   * @param {Array.<(AmdId|string)>=} opt_dependencies A list of valid AMD
   *     module IDs on which the partial module depends.
   *
   * @private
   * @constructor
   */
  function AmdPartial(exporter, opt_dependencies) {
    this.dependencies = opt_dependencies
    this.module = {};

    if (isFunction(exporter)) {
      this.exports = {};
      this.exporter = exporter;
    } else {
      this.exports = exporter;
    }
  }

  /**
   * Adds the specified module ID to this definition and, as a side effect,
   * immediately exports the module's interface if it currently has one. Note:
   * only the first call with a defined {@code id} will set this module's ID.
   *
   * @public
   */
  AmdPartial.prototype.setId = function (id) {
    if (!this.id) {
      this.id = new AmdId(id);

      this.module.id = this.id.toString();
      this.module.uri = this.id.toUri();
    }

    if (this.exports) {
      AmdLoader.cacheModule(this.id, this.exports);
    }
  };

  /**
   * Builds a list of dependencies for this module, parsing {@code require}
   * expressions from the body of the module's exporter function if necessary.
   *
   * @return {!Array.<string>} An array of string literals identifying this
   *     module's dependencies or an empty array if this module has none.
   *
   * @public
   */
  AmdPartial.prototype.getDependencies = (function () {
    var commentRe = /(?:\/\*[\s\S]*?\*\/|\/\/.*)(?:[\n\r])*/g
      , requireRe = /require\s*?\(\s*(['"])(.*?[^\\])(?:\1|['"])\s*\)*/g
      , cjsDependencies = [ 'require', 'exports', 'module' ]
      ;

    return function () {
      if (!this.extractedDependencies) {
        var deps = this.dependencies;

        if (!deps) {
          deps = [];

          if (this.exporter) {
            for (var x = 0, n = Math.max(3, this.exporter.length); x < n; x++) {
              deps.push(cjsDependencies[x]);
            }
          }
        }

        if (deps.indexOf('require') > -1) {
          var src = this.exporter.toString().replace(commentRe, '');

          requireRe.lastIndex = 0;
          while ((match = requireRe.exec(src)) !== null) {
            deps.push(match[2]);
          }
        }

        this.extractedDependencies = deps;
      }

      return this.extractedDependencies;
    };
  })();

  /**
   * Builds the list of modules on which this module dependends.
   *
   * @return {Array.<Object>} An array of modules on which this module depends
   *     or an empty array if this module has no dependencies.
   *
   * @public
   */
  AmdPartial.prototype.getModules = function () {
    var dependencies = this.getDependencies()
      , x = 0
      , n = dependencies.length
      , modules = new Array(n)
      ;

    for (; x < n; ++x) {
      var id = new AmdId(dependencies[x]);

      switch (id.toString()) {
      case 'require':
        modules[x] = require;
        break;
      case 'exports':
        modules[x] = this.exports;
        break;
      case 'module':
        modules[x] = this.module;
        break;
      default:
        modules[x] = AmdLoader.getModule(id);
      }
    }

    return modules;
  };

  /**
   * Completes the initialization of this partial module; after which, and
   * assuming this module has an ID, the module's interface will be available
   * and ready for others to use.
   *
   * @param {string} resourceId The module ID string corresponding to this
   *     module's resource, which is likely only known after the resource
   *     file loads.
   *
   * @public
   */
  AmdPartial.prototype.finalize = function (resourceId) {
    var exporter = this.exporter
      , result = exporter && exporter.apply(null, this.getModules())
      ;

    if (result) {
      this.exports = result;
    }

    this.setId(resourceId);
  };

  // -------------------------------------------------------------------------
  // Minimal Rig

  /** @private */
  var ostring = Object.prototype.toString;

  /**
   * Determines if reference {@code value} is an array.
   *
   * @param {*} value The reference to test.
   *
   * @return {boolean} {@code true} if {@code value} is an array;
   *     {@code false} otherwise.
   *
   * @private
   */
  function isArray(value) {
    return !!value && ostring.call(value) === '[object Array]';
  }

  /**
   * Determines if reference {@code value} is a function.
   *
   * @param {*} value The reference to test.
   *
   * @return {boolean} {@code true} if {@code value} is a function;
   *     {@code false} otherwise.
   *
   * @private
   */
  function isFunction(value) {
    return !!value && typeof value === 'function';
  }

  /**
   * Determines if reference {@code value} is a non-primitive, non-null object
   * type; not {@code boolean}, {@code number}, {@code string}, {@code null},
   * or {@code undefined}, but any other data type that can be extended
   * dynamically with properties and methods such as the primitive wrappers
   * {@code Boolean}, {@code Number}, @{code String}, as well as built-in types
   * like {@code Array}, {@code Date}, {@code Function}, {@code Object},
   * {@code RegExp}, and others.
   *
   * @param {*} value The value to test.
   *
   * @return {boolean} {@code true} if {@code value} is a string;
   *     {@code false} otherwise.
   *
   * @private
   */
  function isObject(value) {
    return !!value && typeof value === 'object' || typeof value === 'function';
  }

  /**
   * Determines if reference {@code value} is a string.
   *
   * @param {*} value The value to test.
   *
   * @return {boolean} {@code true} if {@code value} is a string;
   *     {@code false} otherwise.
   *
   * @private
   */
  function isString(value) {
    return value != null && typeof value === 'string' ||
        ostring.call(value) === '[object String]';
  }

  /**
   * Appends {@code subtype} to {@code opt_supertype}'s prototype chain so that
   * {@code subtype} inherits all of the methods and properties defined by its
   * ancestor types in the chain, including the core {@code Object} prototype;
   * furthermore, {@code opt_supertype} will be made accessible via the
   * {@code subtype.supertype} property (or, from within a {@code subtype}
   * instance, the {@code this.constructor.supertype} property).
   *
   * @param {!Function} subtype The constructor that will inherit methods and
   *     properties from {@code opt_supertype} by being appended to its
   *     prototype chain.
   * @param {Function=} opt_supertype The constructor of the prototype chain
   *     that {@code subtype} will join, if specified; the core {@code Object}
   *     constructor otherwise.
   *
   * @return {!Function} {@code subtype} after it has been subjoined with the
   *     {@code opt_supertype} prototype chain.
   *
   * @private
   */
  function subjoin(subtype, opt_supertype) {
    opt_supertype = opt_supertype || Object;
    PrototypalIntermediate.prototype = opt_supertype.prototype;
    subtype.prototype = new PrototypalIntermediate();
    subtype.supertype = opt_supertype;
    subtype.prototype.constructor = subtype;

    return subtype;
  }

  /** @private */
  function PrototypalIntermediate() {}

  // -------------------------------------------------------------------------
  // Exports

  gspace.define = define;

  if (ctx.module) {
    ctx.module.exports = require;
  } else {
    gspace.require = require;
  }
})(this);
