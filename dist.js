#!/usr/bin/env node

var fs = require('fs');

var CORE_HEAD_RE = /^(\(function\s*\(\)\s*\{\s*)$/m;
var CORE_TAIL_RE = /^(\}\)\(\);)$/m;
var PARTIAL_RE = /\s*(\}\)\(.*\);)\s*/;

var stockFilename = './src/rig.js';
var source;
var implFilenames = [ './src/node-impl.js' ]; 
var implSources = [];
var output = new Array(3);

function fetchSource() {
  fs.readFile(stockFilename, { encoding: 'utf8' }, function (error, data) {
    if (error) {
      console.error('Could not read core rig AMD implementation.');
      throw error;
    } else {
      source = data;
      extractCore();
      distSource();
    }
  });
}

function extractCore() {
  var head = CORE_HEAD_RE.exec(source);
  var tail = CORE_TAIL_RE.exec(source);
  output[1] = '\n' + source.substring(head.index, tail.index) + tail[1] + '\n';
  maybeFinish();
}

function distSource() {
  fs.writeFile('./dist/rig.js', source, function (error) {
    if (error) {
      console.error('Could not write rig distribution.', error);
      process.exit(1);
    }
  });
}

function fetchImplSource(index) {
  var implFilename = implFilenames[index];

  fs.readFile(implFilename, { encoding: 'utf8' }, function (error, data) {
    if (error) {
      console.error('Could not read rig Node.js runtime implementation.', error);
      process.exit(1);
    } else {
      implSources[index] = data;
      extractImpl(index);
    }
  });  
}

function extractImpl(index) {
  var match = PARTIAL_RE.exec(implSources[index]);
  output[0] = implSources[index].substring(0, match.index);
  output[2] = match[1];
  maybeFinish();
}

function maybeFinish() {
  if (output[0] !== undefined && output[1] !== undefined) {
    fs.writeFile('./dist/rig-node.js', output.join('\n'), function (error) {
      if (error) {
        console.error('Could not write rig distribution.', error);
        process.exit(1);
      }

      fs.chmodSync('./dist/rig-node.js', 0755);
      output[0] = undefined;
      output[2] = undefined;
    });
  } 
}

fetchSource();

var x = implFilenames.length;
while (x--) {
  fetchImplSource(x);
}
