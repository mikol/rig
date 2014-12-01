define(['./subjoin'], function (subjoin) {
  // --------------------------------------------------------------------------
  // Local Variables

  var HEX_RE = /[A-Fa-f0-9]{2}/g;
  var RGB_RE = /rgb\(\s*(\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})\s*\)/;
  var RGBA_RE = /rgba\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3}),\s*((?:0\.)?\d+|1(?:\.0+)?)\s*\)/;

  // --------------------------------------------------------------------------
  // Local Functions

  function clamp(value, opt_min, opt_max) {
    var min = arguments.length === 2 ? opt_min : 0
      , max = arguments.length === 3 ? opt_max : 1
      ;

    return Math.min(max, Math.max(min, value));
  }

  function decimalToHex(decimal) {
    return (decimal < 16 ? '0' : '') + decimal.toString(16);
  }

  function hslToRgb(hsl) {
    // Adapted from (http://en.wikipedia.org/wiki/HSL_and_HSV#From_HSL).
    var hue = hsl[0] % 360
      , saturation = hsl[1]
      , lightness = hsl[2]
      ;

    // Chroma.
    var c = (1 - Math.abs(2 * lightness - 1)) * saturation;
    // The index of hue when 360 degrees is divided into six parts.
    var x = c * (1 - Math.abs((hue / 60) % 2 - 1));
    // Adjustment added to each channel in point to match lightness.
    var m = lightness - (c / 2);
    // A point on an RGB cube that matches the hue and chroma of our color.
    var i = Math.floor((hue / 60) % 6);
    // The second largest component of the color.
    var point =
      [ [c, x, 0]
      , [x, c, 0]
      , [0, c, x]
      , [0, x, c]
      , [x, 0, c]
      , [c, 0, x]
      ][i];

    // The RGB point adjusted to match lightness.
    return [
      Math.round((point[0] + m) * 255),
      Math.round((point[1] + m) * 255),
      Math.round((point[2] + m) * 255)
    ];
  }

  function hsvToRgb(hsv) {
    // Adapted from (http://en.wikipedia.org/wiki/HSL_and_HSV#From_HSV).
    var hue = ((hsv[0] % 360) / 360) * 360
      , saturation = hsv[1]
      , value = hsv[2]
      ;

    // Chroma.
    var c = saturation * value;
    // The second largest component of the color.
    var x = c * (1 - Math.abs((hue / 60) % 2 - 1));
    // Adjustment added to each channel in point to match value.
    var m = value - c;
    // The index of hue when 360 degrees is divided into six parts.
    var i = Math.floor((hue / 60) % 6);
    // A point on an RGB cube that matches the hue and chroma of our color.
    var point =
      [ [c, x, 0]
      , [x, c, 0]
      , [0, c, x]
      , [0, x, c]
      , [x, 0, c]
      , [c, 0, x]
      ][i];

    // The RGB point adjusted to match value.
    return [
      Math.round((point[0] + m) * 255),
      Math.round((point[1] + m) * 255),
      Math.round((point[2] + m) * 255)
    ];
  }

  // --------------------------------------------------------------------------
  // Type Definition

  function Color() {}

  var T = subjoin(Color);
  var P = T.prototype;

  // --------------------------------------------------------------------------
  // Type Methods

  // ----------------------------------------------------------------
  // Core Initialization Methods

  T.fromHsl = function (hsl, opt_alpha) {
    var rgb = hslToRgb(hsl);
    var alpha = arguments.length === 2 ? opt_alpha : 1;
    var color = T.fromRgba(rgb.concat(alpha));

    color.hsla = hsl.concat(alpha);

    return color;
  };

  T.fromHsla = function (hsla) {
    var rgb = hslToRgb(hsla);
    var color = T.fromRgba(rgb.concat(hsla[3]));

    color.hsla = hsla;

    return color;
  };

  T.fromHsv = function (hsv, opt_alpha) {
    var rgb = hsvToRgb(hsv);
    var alpha = arguments.length === 2 ? opt_alpha : 1;
    var color = T.fromRgba(rgb.concat(alpha));

    color.hsva = hsv.concat(alpha);

    return color;
  };

  T.fromHsva = function (hsva) {
    var rgb = hsvToRgb(hsva);
    var color = T.fromRgb(rgb.concat(hsva[3]));

    color.hsva = hsva;

    return color;
  };

  T.fromRgb = function (rgb, opt_alpha) {
    var alpha = arguments.length === 2 ? opt_alpha : 1;
    var color = new Color();

    color.rgba = rgb.concat(alpha);

    return color;
  };

  T.fromRgba = function (rgba) {
    var color = new Color();

    color.rgba = rgba;

    return color;
  };

  // ----------------------------------------------------------------
  // String Initialization Methods

  T.fromHexString = function (hexString) {
    var rgba;

    if (hexString.indexOf('#') === 0) {
      // #RRGGBBAA or #RRGGBB or #RGBA or #RGB
      hexString = hexString.slice(1);
    }

    if (hexString.length === 8 || hexString.length === 6) {
      // RRGGBBAA or RRGGBB
      rgba = hexString.match(HEX_RE).map(function (pair) {
        return parseInt(pair, 16);
      });
    } else {
      // RGBA or RGB
      rgba = hexString.split('').map(function (single) {
        return parseInt(single + single, 16);
      });
    }

    if (rgba.length === 4) {
      rgba[3] = rgba[3] / 255;
      return T.fromRgba(rgba);
    } else if (rgba.length === 3) {
      return T.fromRgba(rgba.concat(1));
    }

    throw '"' + hexString + '" is not a valid hexidecimal color string.';
  };

  T.fromRgbString = function (rgbString) {
    var rgb = rgbString.match(RGB_RE);

    if (rgb === null) {
      throw '"' + rgbString + '" is not a valid RGB color string.';
    }

    return new T.fromRgba([Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), 1]);
  };

  T.fromRgbaString = function (rgbaString) {
    var rgba = rgbaString.match(RGBA_RE);

    if (rgba === null) {
      throw '"' + rgbaString + '" is not a valid RGBA color string.';
    }

    return new T.fromRgba([Number(rgba[1]), Number(rgba[2]), Number(rgba[3]),
        Number(rgba[4])]);
  };

  // --------------------------------------------------------------------------
  // Instance Variables

  P.rgba = [0, 0, 0, 1];
  P.hsla = null;
  P.hsva = null;

  // --------------------------------------------------------------------------
  // Instance Methods

  P.toHsla = function () {
    // Adapted from Michal Jackson's "RGB to HSL and RGB to HSV Color Model
    // Conversion Algorithms in JavaScript" (http://goo.gl/vULDmg).
    if (this.hsla === null) {
      var red = this.rgba[0] / 255
        , green = this.rgba[1] / 255
        , blue = this.rgba[2] / 255
        , max = Math.max(red, green, blue)
        , min = Math.min(red, green, blue)
        , delta = max - min
        , hue
        , saturation
        , lightness = (max + min) / 2
        ;

      if (max === min) {
        hue = saturation = 0;
      } else {
        if (lightness > 0.5) {
          saturation = delta / (2 - max - min);
        } else {
          saturation = delta / (max + min);
        }

        if (max === red) {
          hue = (green - blue) / delta + (green < blue ? 6 : 0);
        } else if (max === green) {
          hue = (blue - red) / delta + 2;
        } else {
          hue = (red - green) / delta + 4;
        }

        hue = hue / 6;
      }

      this.hsla = [
        Math.round(hue * 360),
        saturation,
        lightness,
        this.rgba[3]
      ];
    }

    return this.hsla.slice(0);
  };

  P.toHsva = function () {
    // Adapted from Michal Jackson's "RGB to HSL and RGB to HSV Color Model
    // Conversion Algorithms in JavaScript" (http://goo.gl/vULDmg).
    if (this.hsva === null) {
      var red = this.rgba[0] / 255
        , green = this.rgba[1] / 255
        , blue = this.rgba[2] / 255
        , max = Math.max(red, green, blue)
        , min = Math.min(red, green, blue)
        , delta = max - min
        , hue
        , saturation
        , value = max
        ;

      if (max === 0) {
        saturation = 0;
      } else {
        saturation = delta / max;
      }

      if (max === min) {
          hue = 0;
      } else {
        if (max === red) {
          hue = (green - blue) / delta + (green < blue ? 6 : 0);
        } else if (max === green) {
          hue = (blue - red) / delta + 2;
        } else {
          hue = (red - green) / delta + 4;
        }

        hue = hue / 6;
      }

      this.hsva = [
        Math.round(hue * 360),
        saturation,
        value,
        this.rgba[3]
      ];
    }

    return this.hsva.slice(0);
  };

  P.toRgba = function () {
    return this.rgba;
  };

  P.adjustHslHue = function (adjustment) {
    var hsla = this.toHsla()
      , hue = (hsla[0] + adjustment) % 360
      ;

    hsla[0] = hue > 0 ? hue : 360 + hue;

    return T.fromHsla(hsla);
  };

  P.adjustHslSaturation = function (adjustment) {
    var hsla = this.toHsla()
      , saturation = hsla[1] + adjustment;
      ;

    hsla[1] = clamp(saturation);

    return T.fromHsla(hsla);
  };

  P.adjustHslLightness = function (adjustment) {
    var hsla = this.toHsla()
      , lightness = hsla[2] + adjustment;
      ;

    hsla[2] = clamp(lightness);

    return T.fromHsla(hsla);
  };

  P.toHexString = function () {
    var hexString = decimalToHex(this.rgba[0])
        + decimalToHex(this.rgba[1])
        + decimalToHex(this.rgba[2])
        + (this.rgba[3] < 1 ? decimalToHex(Math.round(this.rgba[3] * 255)) : '')
      , a = hexString.split('')
      ;

    if (a[0] === a[1] && a[2] === a[3] && a[4] === a[5]) {
      if (a.length === 6) {
        hexString = a[0] + a[2] + a[4];
      } else if (a[6] === a[7]) {
        hexString = a[0] + a[2] + a[4] + a[6];
      }
    }

    return '#' + hexString;
  };

  P.toString = function () {
    return 'rgba(' + this.rgba.join(',') + ')';
  };

  return T;
});
