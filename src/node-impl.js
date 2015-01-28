#!/usr/bin/env node

/**
 * @license Copyright 2015 Mikol Graves.
 * Available under a Creative Commons Attribution 4.0 International License.
 * See http://creativecommons.org/licenses/by/4.0/ for details.
 */

(function (global, TypeError, undefined) {
  // --------------------------------------------------------------------------
  // Node.js Runtime Implementation

  var fs = require('fs');
  var path = require('path');

  /**
   * The pathname (working directory) from which unqualified (i.e., top-level
   * and relative) module IDs will be resolved.
   *
   * @type {string}
   * @private
   */
  var wd = process.cwd();

  /**
   * Loads `id` if it exists, then calls `done`; calls `retry` otherwise.
   *
   * @param {!string} id The identifier of the module to try to load.
   * @param {!Function} done The function that will be executed when the
   *     module is loaded.
   * @param {!Function} retry The function that will be executed if the module
   *     does not exist.
   *
   * @private
   */
  function tryToLoad(id, done, retry) {
    if (id) {
      var url = id.match(/\.js$/) ? id : id + '.js';

      fs.exists(url, function (exists) {
        if (exists) {
          fs.realpath(url, function (error, result) {
            if (error) {
              console.error('Could not resolve path.', error);
            } else {
              require(result);
              done();
            }
          });
        } else {
          retry();
        }
      });
    } else {
      retry();
    }
  }

  /**
   * Loads module `id` and executes `opt_callback` when it is ready.
   *
   * @param {!string} id The normalized identifier of the module to load.
   * @param {string} fallbackId The unmodified identifier.
   * @param {!Function} opt_callback The function that will be executed when the
   *     module is loaded.
   *
   * @private
   */
  function loader(ids, opt_callback) {
    var done = function () {
      opt_callback && opt_callback(ids.normalized);
    };

    tryToLoad(ids.fqid, done, function () {
      tryToLoad(ids.normalized, done, function () {
        var exports = require(ids.normalized);
        opt_callback && opt_callback(ids.normalized, exports);
      });
    });
  };

  /**
   * Exports the AMD require function to the calling module’s scope and adds
   * the AMD define function to the global scope.
   *
   * @param {!Function} require The AMD module loading function to export.
   * @param {!Function} define The AMD module defining function to export.
   *
   * @private
   */
  function publish(require, define) {
    module.exports = require;
    global.define = define;
    
    var main = process.argv[2];
    if (main) {
      fs.realpath(main, function (error, result) {
        if (error) {
          throw error;
        }

        process.chdir(path.dirname(result));
        wd = process.cwd();
        require([path.basename(result)], function () {});
      });
    }
  }
})(global, TypeError);
