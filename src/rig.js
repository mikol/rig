(function (global) {
  var ostring = Object.prototype.toString;

  function PrototypalIntermediate() {};

  Function.prototype.subjoins = function (supertype) {
    PrototypalIntermediate.prototype = supertype.prototype;
    this.prototype = new PrototypalIntermediate();
    this.supertype = supertype;
    this.prototype.constructor = this;
  }

  // ---------------------------------------------------------------
  // AMD Module Loader

  var AmdLoader = {};

  (function (exports) {
    var sibling = document.getElementsByTagName('script')[0]
      , cache = { require: require, exports: true, module: true }
      , queue = []
      , queued = {}
      ;

    /**
     * Loads module {@code id} and executes {@code callback} when it is ready.
     *
     * @param {!AmdId} id The ID of the module to load.
     * @param {!Function} callback The function that will be executed when the
     *     module is ready.
     */
    function load(id, callback) {
      var el = document.createElement('script');
      el.charset = 'utf-8';
      el.async = true;
      el.src = id.toUri();
      el.onload = onLoad.bind(null, el, id, callback);

      sibling.parentNode.insertBefore(el, sibling);
    }

    /**
     * Builds a list of dependencies for any queued partially defined modules.
     *
     * @return {!Array.<string>} An array of string literals identifying the
     *     queued modules' dependencies or an empty array if there are none.
     */
    function getDependencies(opt_relativeTo) {
      var x = 0
        , xn = queue.length
        , result = []
        ;

      for (; x < xn; ++x) {
        var dependencies = queue[x].getDependencies();
        for (var j = 0, jn = dependencies.length; j < jn; ++j) {
          // This has the (desireable and necessary) side effect of relitivizing
          // the partial's dependencies.
          dependencies[j] = new AmdId(dependencies[j], opt_relativeTo);

          if (result.indexOf(dependencies[j]) === -1) {
            result.push(dependencies[j]);
          }
        }
      }

      return result;
    }

    /**
     * Handles load events for scripts dynamically inserted into the DOM.
     *
     * @param {!Element} el A reference to the script tag.
     * @param {!AmdId} id The ID of the module loaded by {@code el}.
     * @param {!Function} callback The function that will be executed once all
     *     of the queued partial module definitions have been finalized.
     */
    function onLoad(el, id, callback) {
      var partials = queue.slice()
        , dependencies = getDependencies(id.getDirname())
        ;

      queue = [];

      require(dependencies, function () {
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
     * @param {Array.<(AmdId|string)>} opt_dependencies A list of valid AMD
     *     module IDs on which the parital module depends.
     * @param {AmdId=} opt_id A valid AMD module ID.
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
      cache[new AmdId(id)] = module;
    }

    /**
     * @param {(AmdId|string)} A valid AMD module ID.
     *
     * @return {Object} The module corresponding to the specified {@code id}.
     */
    function getModule(id) {
      return cache[new AmdId(id)];
    }

    /**
     * @param {Array.<(AmdId|string)>} A list of valid AMD module IDs.
     *
     * @return {Array.<Object>} An array of modules corresponding to the
     *     specified {@code dependencies}.
     */
    function getModules(dependencies) {
      var list = []
        , x = 0
        , xn = dependencies.length
        ;

      for (; x < xn; ++x) {
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

  // -------------------------------------------------------------------------
  // AMD Module ID

  /**
   * A convenient wrapper for a string literal AMD module identifier.
   *
   * @param {!string} value A valid string literal module identifier.
   * @param {string=} opt_relativeTo A valid top-level module identifier.
   *
   * @constructor
   */
  function AmdId(value, opt_relativeTo) {
    if (!AmdId.isValid(value)) {
      throw new TypeError('@param value must be a valid, useable '
        + 'AMD module ID string.');
    }

    if (opt_relativeTo) {
      try {
        if ((opt_relativeTo = new AmdId(opt_relativeTo)).isRelative()) {
          throw 0;
        }
      } catch (ex) {
        throw new TypeError('@param value must be a valid, useable top-level '
          + 'AMD module ID string.');
      }
    }

    this.value = value;
    this.relativeTo = opt_relativeTo;
  }

  AmdId.subjoins(String);

  /**
   * @param {string} s The identfier to validate.
   *
   * @return {boolean} {@code true} If the specified identifer {@code s} can be
   *     used to look up and load an AMD module; {@code false} otherwise.
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
   */
  AmdId.prototype.isRelative = function () {
    return this.value.indexOf('.') === 0;
  };

  /**
   * @return {string} The directory portion of this AMD module ID (for example,
   *     {@code '/foo/bar/baz/asdf'} in {@code '/foo/bar/baz/asdf/quux'}).
   */
  AmdId.prototype.getDirname = function () {
    if (!this.dirname) {
      this.dirname = this.slice(0, -1).join('/');
    }

    return this.dirname;
  };

  /**
   * @return {string} The last portion of this AMD module ID (for example,
   *     {@code 'quux'} in {@code '/foo/bar/baz/asdf/quux'}).
   */
  AmdId.prototype.getBasename = function () {
    if (!this.basename) {
      this.basename = this.slice(-1)[0];
    }

    return this.basename;
  };

  /**
   * @return {string} The filename extension of this ID if it has one;
   *     {@code ''} otherwise.
   */
  AmdId.prototype.getExtension = function () {
    if (!this.extension) {
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
   */
  AmdId.prototype.slice = function (begin, end) {
    if (!this.terms) {
      this.normalize();
    }

    return this.terms.slice(begin, end);
  }

  /**
   * @return {string} The canonical URI for this AMD module ID.
   */
  AmdId.prototype.toUri = function () {
    if (!this.uri) {
      this.uri = this.normalize() + (this.hasExtension() ? '' : '.js');
    }

    return this.uri;
  };

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
      var parts = (this.isRelative() && this.relativeTo)
            ? this.relativeTo.slice().concat(this.value.split('/'))
            : this.value.split('/')
        , part
        , x = 0
        , xn = parts.length
        // Retain a leading slash if there is one.
        , terms = parts[x] === '' ? [''] : []
        ;

      for (; x < xn; ++x) {
        part = parts[x]
        if (part === '.' || part === '') {
          continue;
        } else if (part === '..') {
          terms.pop();
        } else {
          terms.push(part);
        }
      }

      this.terms = terms;
      this.normalized = terms.join('/');
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
   * @param {!(Function|Object)} exporter
   * @param {Array.<string>=} opt_dependencies
   *
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
   * @return {AmdId} This module's ID if it has one; {@code undefined} otherwise.
   */
  AmdPartial.prototype.getId = function () {
    return this.id;
  }

  /**
   * Adds the specified module ID to this definition and, as a side effect,
   * immediately exports the module's interface. Note: only the first call
   * with a defined {@code id} will have any effect; all subsequent calls
   * will be ignored.
   */
  AmdPartial.prototype.setId = function (id) {
    if (!this.id) {
      this.id = new AmdId(id);

      this.module.id = this.id.toString();
      this.module.uri = this.id.toUri();

      AmdLoader.cacheModule(this.id, this.exports);
    }
  };

  /**
   * Builds a list of dependencies for this module, parsing {@code require}
   * expressions from the body of the module's exporter function if necessary.
   *
   * @return {!Array.<string>} An array of string literals identifying this
   *     module's dependencies or an empty array if this module has none.
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
            for (var x = 0, xn = Math.max(3, this.exporter.length); x < xn; x++) {
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
   */
  AmdPartial.prototype.getModules = function () {
    var dependencies = this.getDependencies()
      , x = 0
      , xn = dependencies.length
      , modules = new Array(xn)
      ;

    for (; x < xn; ++x) {
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
   */
  AmdPartial.prototype.finalize = function (resourceId) {
    var module = this.module
      , exporter = this.exporter
      ;

    if (!this.id && resourceId) {
      this.setId(resourceId);
    }

    if (exporter) {
      this.exports = exporter.apply(null, this.getModules()) || this.exports;
    }

    this.id && AmdLoader.cacheModule(this.id, this.exports);
  };

  // -------------------------------------------------------------------------
  // Asynchronous Module Definition (AMD) API

  /**
   * Registers the module named by {@code opt_id} and assembled by
   * {@code exporter} so that it can be referenced by other modules.
   *
   * @param {(string|null|undefined)} opt_id
   * @param {(Array.<string>|null|undefined)} opt_dependencies
   * @param {!(Function|Object)} exporter
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

  // Conforms with the AMD API.
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
   */
  function require(dependency, opt_callback) {
    if (isArray(dependency)) {
      requireAsync(dependency, opt_callback);
    } else {
      return requireSync(dependency);
    }
  }

  /**
   * Converts a string to a URL path.
   *
   * @param {string} id The identifier to convert to a URL path.
   *
   * @return {string} The URL path corresponding to {@code id}.
   */
  require.toUrl = function (id) {
    return new AmdId(id).toUri();
  };

  /**
   * Asynchronously loads the resources specified by {@code dependencies} and
   * executes {@code callback} after they have all finished loading.
   *
   * @param {!Array.<string>} dependencies A list of valid string literal AMD
   *     module IDs to be loaded asynchronously.
   * @param {!Function} callback The function that should be executed after
   *     all of the resources specified by {@code dependencies} have finished
   *     loading.
   */
  function requireAsync(dependencies, callback) {
    var x = 0
      , xn = dependencies.length
      , skipped = 0
      ;

    function fn() {
      if (xn === 0) {
        callback.apply(null, AmdLoader.getModules(dependencies));
      }

      --xn;
    }

    for (; x < xn; ++x) {
      var id = new AmdId(dependencies[x]);

      if (AmdLoader.getModule(id)) {
        ++skipped;
        continue;
      }

      AmdLoader.load(id, fn);
    }

    xn -= skipped;

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
   */
  function requireSync(dependency) {
    try  {
      var id = new AmdId(dependency);
    } catch (ex) {
      throw new TypeError('@param dependency must be a valid module ID string.');
    }

    var module = AmdLoader.getModule(id);

    if (!module) {
      throw new ReferenceError('Module "' + dependency + '" is not defined.');
    }

    return module;
  }

  // -------------------------------------------------------------------------
  // Minimal Rig

  /**
   * Determines if reference {@code value} is an array.
   *
   * @param {*} value The reference to test.
   *
   * @return {boolean} {@code true} if {@code value} is an array;
   *     {@code false} otherwise.
   */
  function isArray(value) {
    return !!value && ostring.call(value) === '[object Array]';
  };


  /**
   * Determines if reference {@code value} is a function.
   *
   * @param {*} value The reference to test.
   *
   * @return {boolean} {@code true} if {@code value} is a function;
   *     {@code false} otherwise.
   */
  function isFunction(value) {
    return !!value && typeof value === 'function';
  };

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
   */
  function isObject(value) {
    return !!value && typeof value === 'object' || typeof value === 'function';
  };

  /**
   * Determines if reference {@code value} is a string.
   *
   * @param {*} value The value to test.
   *
   * @return {boolean} {@code true} if {@code value} is a string;
   *     {@code false} otherwise.
   */
  function isString(value) {
    return value != null && typeof value === 'string' ||
        ostring.call(value) === '[object String]';
  };

  // -------------------------------------------------------------------------
  // Exports

  global['define'] = define;
  global['require'] = require;
})(this);
