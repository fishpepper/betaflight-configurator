'use strict';

var SYM = SYM || {};
SYM.VOLT = 0x06;
SYM.RSSI = 0x01;
SYM.AH_RIGHT = 0x02;
SYM.AH_LEFT = 0x03;
SYM.THR = 0x04;
SYM.THR1 = 0x05;
SYM.FLY_M = 0x9C;
SYM.ON_M = 0x9B;
SYM.AH_CENTER_LINE = 0x26;
SYM.AH_CENTER_LINE_RIGHT = 0x27;
SYM.AH_CENTER = 0x7E;
SYM.AH_BAR9_0 = 0x80;
SYM.AH_DECORATION = 0x13;
SYM.LOGO = 0xA0;
SYM.AMP = 0x9A;
SYM.MAH = 0x07;
SYM.METRE = 0xC;
SYM.FEET = 0xF;
SYM.GPS_SAT = 0x1F;
SYM.PB_START = 0x8A;
SYM.PB_FULL = 0x8B;
SYM.PB_EMPTY = 0x8D;
SYM.PB_END = 0x8E;
SYM.PB_CLOSE = 0x8F;
SYM.BATTERY = 0x96;
SYM.ARROW_NORTH=0x68;
SYM.ARROW_SOUTH=0x60;
SYM.ARROW_EAST=0x64;
SYM.HEADING_LINE=0x1D;
SYM.HEADING_DIVIDED_LINE=0x1C;
SYM.HEADING_N=0x18;
SYM.HEADING_S=0x19;
SYM.HEADING_E=0x1A;
SYM.HEADING_W=0x1B;
SYM.TEMP_C = 0x0E;

var FONT = FONT || {};

FONT.initData = function() {
  if (FONT.data) {
    return;
  }
  FONT.data = {
    // default font file name
    loaded_font_file: 'default',
    // array of arry of image bytes ready to upload to fc
    characters_bytes: [],
    // array of array of image bits by character
    characters: [],
    // an array of base64 encoded image strings by character
    character_image_urls: []
  }
};

FONT.constants = {
  SIZES: {
    /** NVM ram size for one font char, actual character bytes **/
    MAX_NVM_FONT_CHAR_SIZE: 54,
    /** NVM ram field size for one font char, last 10 bytes dont matter **/
    MAX_NVM_FONT_CHAR_FIELD_SIZE: 64,
    CHAR_HEIGHT: 18,
    CHAR_WIDTH: 12,
    LINE: 30
  },
  COLORS: {
    // black
    0: 'rgba(0, 0, 0, 1)',
    // also the value 3, could yield transparent according to
    // https://www.sparkfun.com/datasheets/BreakoutBoards/MAX7456.pdf
    1: 'rgba(255, 255, 255, 0)',
    // white
    2: 'rgba(255,255,255, 1)'
  }
};

/**
 * Each line is composed of 8 asci 1 or 0, representing 1 bit each for a total of 1 byte per line
 */
FONT.parseMCMFontFile = function(data) {
  var data = data.split("\n");
  // clear local data
  FONT.data.characters.length = 0;
  FONT.data.characters_bytes.length = 0;
  FONT.data.character_image_urls.length = 0;
  // make sure the font file is valid
  if (data.shift().trim() != 'MAX7456') {
    var msg = 'that font file doesnt have the MAX7456 header, giving up';
    console.debug(msg);
    Promise.reject(msg);
  }
  var character_bits = [];
  var character_bytes = [];
  // hexstring is for debugging
  FONT.data.hexstring = [];
  var pushChar = function() {
    FONT.data.characters_bytes.push(character_bytes);
    FONT.data.characters.push(character_bits);
    FONT.draw(FONT.data.characters.length-1);
    //$log.debug('parsed char ', i, ' as ', character);
    character_bits = [];
    character_bytes = [];
  };
  for (var i = 0; i < data.length; i++) {
    var line = data[i];
    // hexstring is for debugging
    FONT.data.hexstring.push('0x' + parseInt(line, 2).toString(16));
    // every 64 bytes (line) is a char, we're counting chars though, which are 2 bits
    if (character_bits.length == FONT.constants.SIZES.MAX_NVM_FONT_CHAR_FIELD_SIZE * (8 / 2)) {
      pushChar()
    }
    for (var y = 0; y < 8; y = y + 2) {
      var v = parseInt(line.slice(y, y+2), 2);
      character_bits.push(v);
    }
    character_bytes.push(parseInt(line, 2));
  }
  // push the last char
  pushChar();
  return FONT.data.characters;
};


FONT.openFontFile = function($preview) {
  return new Promise(function(resolve) {
    chrome.fileSystem.chooseEntry({type: 'openFile', accepts: [{extensions: ['mcm']}]}, function (fileEntry) {
      FONT.data.loaded_font_file = fileEntry.name;
      if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError.message);
          return;
      }
      fileEntry.file(function (file) {
        var reader = new FileReader();
        reader.onloadend = function(e) {
          if (e.total != 0 && e.total == e.loaded) {
            FONT.parseMCMFontFile(e.target.result);
            resolve();
          }
          else {
            console.error('could not load whole font file');
          }
        };
        reader.readAsText(file);
      });
    });
  });
};

/**
 * returns a canvas image with the character on it
 */
var drawCanvas = function(charAddress) {
  var canvas = document.createElement('canvas');
  var ctx = canvas.getContext("2d");

  // TODO: do we want to be able to set pixel size? going to try letting the consumer scale the image.
  var pixelSize = pixelSize || 1;
  var width = pixelSize * FONT.constants.SIZES.CHAR_WIDTH;
  var height = pixelSize * FONT.constants.SIZES.CHAR_HEIGHT;

  canvas.width = width;
  canvas.height = height;

  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      if (!(charAddress in FONT.data.characters)) {
        console.log('charAddress', charAddress, ' is not in ', FONT.data.characters.length);
      }
      var v = FONT.data.characters[charAddress][(y*width)+x];
      ctx.fillStyle = FONT.constants.COLORS[v];
      ctx.fillRect(x, y, pixelSize, pixelSize);
    }
  }
  return canvas;
};

FONT.draw = function(charAddress) {
  var cached = FONT.data.character_image_urls[charAddress];
  if (!cached) {
    cached = FONT.data.character_image_urls[charAddress] = drawCanvas(charAddress).toDataURL('image/png');
  }
  return cached;
};

FONT.msp = {
  encode: function(charAddress) {
    return [charAddress].concat(FONT.data.characters_bytes[charAddress].slice(0,FONT.constants.SIZES.MAX_NVM_FONT_CHAR_SIZE));
  }
};

FONT.upload = function($progress) {
  return Promise.mapSeries(FONT.data.characters, function(data, i) {
    $progress.val((i / FONT.data.characters.length) * 100);
    return MSP.promise(MSPCodes.MSP_OSD_CHAR_WRITE, FONT.msp.encode(i));
  })
  .then(function() {
    OSD.GUI.jbox.close();
    return MSP.promise(MSPCodes.MSP_SET_REBOOT);
  });
};

FONT.preview = function($el) {
  $el.empty()
  for (var i = 0; i < SYM.LOGO; i++) {
    var url = FONT.data.character_image_urls[i];
    $el.append('<img src="'+url+'" title="0x'+i.toString(16)+'"></img>');
  }
};

FONT.symbol = function(hexVal) {
  return String.fromCharCode(hexVal);
};

var OSD = OSD || {};

// parsed fc output and output to fc, used by to OSD.msp.encode
OSD.initData = function() {
  OSD.data = {
    device: null,
    video_system: null,
    unit_mode: null,
    alarms: [],
    stat_items: [],
    display_items: [],
    timers: [],
    last_positions: {},
    preview_logo: true,
    preview: [],
    tooltips: [],
    display_size: { x: 0, y: 0, total: 0 },
    brightness: { black: 0, white: 0},
    supportedFeatures : 0,
    enabledFeatures : 0
  };
};
OSD.initData();

OSD.generateTimerPreview = function(osd_data, timer_index) {
  var preview = '';
  switch (osd_data.timers[timer_index].src) {
    case 0:
      preview += FONT.symbol(SYM.ON_M);
      break;
    case 1:
    case 2:
      preview += FONT.symbol(SYM.FLY_M);
      break;
  }
  switch (osd_data.timers[timer_index].precision) {
    case 0:
      preview += '00:00';
      break;
    case 1:
      preview += '00:00.00';
      break;
  }
  return preview;
};

OSD.constants = {
  VISIBLE: 0x0800,
  VIDEO_TYPES: [
    'AUTO',
    'PAL',
    'NTSC'
  ],
  VIDEO_LINES: {
    PAL: 16,
    NTSC: 13
  },
  VIDEO_BUFFER_CHARS: {
    PAL: 480,
    NTSC: 390
  },
  UNIT_TYPES: [
    'IMPERIAL',
    'METRIC'
  ],
  TIMER_TYPES: [
    'ON TIME',
    'TOTAL ARMED TIME',
    'LAST ARMED TIME'
  ],
  TIMER_PRECISION: [
    'SECOND',
    'HUNDREDTH'
  ],
  ORIGIN: {
    C: 0,
    N: (1<<0),
    E: (1<<1),
    S: (1<<2),
    W: (1<<3),
    NE: (1<<0) | (1<<1),
    SE: (1<<2) | (1<<1),
    SW: (1<<2) | (1<<3),
    NW: (1<<0) | (1<<3)
  },
  AHISIDEBARWIDTHPOSITION: 7,
  AHISIDEBARHEIGHTPOSITION: 3,

  FEATURES: {
    'Enabled'   : (1 << 0),
    'Inverted'  : (1 << 1),
    // skip brightness 'Brightness' = (1<<2),
    'Logo (on startup)'      : (1 << 8),
    'Pilotlogo' : (1 << 9),
    'Sticks'    : (1 << 10),
    'Spectrum'  : (1 << 11)
  },

  // All display fields, from every version, do not remove elements, only add!
  ALL_DISPLAY_FIELDS: {
    MAIN_BATT_VOLTAGE: {
      name: 'MAIN_BATT_VOLTAGE',
      desc: 'osdDescElementMainBattVoltage',
      default_position: -29,
      positionable: true,
      preview: FONT.symbol(SYM.BATTERY) + '16.8' + FONT.symbol(SYM.VOLT)
    },
    RSSI_VALUE: {
      name: 'RSSI_VALUE',
      desc: 'osdDescElementRssiValue',
      default_position: -59,
      positionable: true,
      preview: FONT.symbol(SYM.RSSI) + '99'
    },
    TIMER: {
      name: 'TIMER',
      default_position: -39,
      positionable: true,
      preview: FONT.symbol(SYM.ON_M) + ' 11:11'
    },
    THROTTLE_POSITION: {
      name: 'THROTTLE_POSITION',
      desc: 'osdDescElementThrottlePosition',
      default_position: -9,
      positionable: true,
      preview: FONT.symbol(SYM.THR) + FONT.symbol(SYM.THR1) + ' 69'
    },
    CPU_LOAD: {
      name: 'CPU_LOAD',
      default_position: 26,
      positionable: true,
      preview: '15'
    },
    VTX_CHANNEL: {
      name: 'VTX_CHANNEL',
      default_position: 1,
      positionable: true,
      preview: 'R:2:1'
    },
    VOLTAGE_WARNING: {
      name: 'VOLTAGE_WARNING',
      default_position: -80,
      positionable: true,
      preview: 'LOW VOLTAGE'
    },
    ARMED: {
      name: 'ARMED',
      desc: 'osdDescElementArmed',
      default_position: -107,
      positionable: true,
      preview: 'ARMED'
    },
    DISARMED: {
      name: 'DISARMED',
      desc: 'osdDescElementDisarmed',
      default_position: -109,
      positionable: true,
      preview: 'DISARMED'
    },
    CROSSHAIRS: {
      name: 'CROSSHAIRS',
      desc: 'osdDescElementCrosshairs',
      default_position: -1,
      positionable: false
    },
    ARTIFICIAL_HORIZON: {
      name: 'ARTIFICIAL_HORIZON',
      desc: 'osdDescElementArtificialHorizon',
      default_position: -1,
      positionable: false
    },
    HORIZON_SIDEBARS: {
      name: 'HORIZON_SIDEBARS',
      desc: 'osdDescElementHorizonSidebars',
      default_position: -1,
      positionable: false
    },
    CURRENT_DRAW: {
      name: 'CURRENT_DRAW',
      desc: 'osdDescElementCurrentDraw',
      default_position: -23,
      positionable: true,
      preview: FONT.symbol(SYM.AMP) + '42.0'
    },
    MAH_DRAWN: {
      name: 'MAH_DRAWN',
      desc: 'osdDescElementMahDrawn',
      default_position: -18,
      positionable: true,
      preview: FONT.symbol(SYM.MAH) + '690'
    },
    CRAFT_NAME: {
      name: 'CRAFT_NAME',
      desc: 'osdDescElementCraftName',
      default_position: -77,
      positionable: true,
      preview: '   CRAFT_NAME   '
    },
    ALTITUDE: {
      name: 'ALTITUDE',
      desc: 'osdDescElementAltitude',
      default_position: 62,
      positionable: true,
      preview: function(osd_data) {
        return '399.7' + FONT.symbol(osd_data.unit_mode === 0 ? SYM.FEET : SYM.METRE)
      }
    },
    ONTIME: {
      name: 'ONTIME',
      desc: 'osdDescElementOnTime',
      default_position: -1,
      positionable: true,
      preview: FONT.symbol(SYM.ON_M) + '05:42'
    },
    FLYTIME: {
      name: 'FLYTIME',
      desc: 'osdDescElementFlyTime',
      default_position: -1,
      positionable: true,
      preview: FONT.symbol(SYM.FLY_M) + '04:11'
    },
    FLYMODE: {
      name: 'FLYMODE',
      desc: 'osdDescElementFlyMode',
      default_position: -1,
      positionable: true,
      preview: 'STAB'
    },
    GPS_SPEED: {
      name: 'GPS_SPEED',
      desc: 'osdDescElementGPSSpeed',
      default_position: -1,
      positionable: true,
      preview: '40'
    },
    GPS_SATS: {
      name: 'GPS_SATS',
      desc: 'osdDescElementGPSSats',
      default_position: -1,
      positionable: true,
      preview: FONT.symbol(SYM.GPS_SAT) + '14'
    },
    GPS_LON: {
      name: 'GPS_LON',
      desc: 'osdDescElementGPSLon',
      default_position: -1,
      positionable: true,
      preview: FONT.symbol(SYM.ARROW_SOUTH) + '00.00000000'
    },
    GPS_LAT: {
      name: 'GPS_LAT',
      desc: 'osdDescElementGPSLat',
      default_position: -1,
      positionable: true,
      preview: FONT.symbol(SYM.ARROW_EAST) + '00.00000000'
    },
    DEBUG: {
      name: 'DEBUG',
      desc: 'osdDescElementDebug',
      default_position: -1,
      positionable: true,
      preview: 'DBG     0     0     0     0'
    },
    PID_ROLL: {
      name: 'PID_ROLL',
      desc: 'osdDescElementPIDRoll',
      default_position: 0x800 | (10 << 5) | 2, // 0x0800 | (y << 5) | x
      positionable: true,
      preview: 'ROL  43  40  20'
    },
    PID_PITCH: {
      name: 'PID_PITCH',
      desc: 'osdDescElementPIDPitch',
      default_position: 0x800 | (11 << 5) | 2, // 0x0800 | (y << 5) | x
      positionable: true,
      preview: 'PIT  58  50  22'
    },
    PID_YAW: {
      name: 'PID_YAW',
      desc: 'osdDescElementPIDYaw',
      default_position: 0x800 | (12 << 5) | 2, // 0x0800 | (y << 5) | x
      positionable: true,
      preview: 'YAW  70  45  20'
    },
    POWER: {
      name: 'POWER',
      desc: 'osdDescElementPower',
      default_position: (15 << 5) | 2,
      positionable: true,
      preview: '142W'
    },
    PID_RATE_PROFILE: {
      name: 'PID_RATE_PROFILE',
      desc: 'osdDescElementPIDRateProfile',
      default_position: 0x800 | (13 << 5) | 2, // 0x0800 | (y << 5) | x
      positionable: true,
      preview: '1-2'
    },
    BATTERY_WARNING: {
      name: 'BATTERY_WARNING',
      desc: 'osdDescElementBatteryWarning',
      default_position: -1,
      positionable: true,
      preview: 'LOW VOLTAGE'
    },
    AVG_CELL_VOLTAGE: {
      name: 'AVG_CELL_VOLTAGE',
      desc: 'osdDescElementAvgCellVoltage',
      default_position: 12 << 5,
      positionable: true,
      preview: FONT.symbol(SYM.BATTERY) + '3.98' + FONT.symbol(SYM.VOLT)
    },
    PITCH_ANGLE: {
      name: 'PITCH_ANGLE',
      desc: 'osdDescElementPitchAngle',
      default_position: -1,
      positionable: true,
      preview: '-00.0'
    },
    ROLL_ANGLE: {
      name: 'ROLL_ANGLE',
      desc: 'osdDescElementRollAngle',
      default_position: -1,
      positionable: true,
      preview: '-00.0'
    },
    MAIN_BATT_USAGE: {
      name: 'MAIN_BATT_USAGE',
      desc: 'osdDescElementMainBattUsage',
      default_position: -17,
      positionable: true,
      preview: FONT.symbol(SYM.PB_START) + FONT.symbol(SYM.PB_FULL) + FONT.symbol(SYM.PB_FULL) + FONT.symbol(SYM.PB_FULL) + FONT.symbol(SYM.PB_FULL) + FONT.symbol(SYM.PB_FULL) + FONT.symbol(SYM.PB_FULL) + FONT.symbol(SYM.PB_FULL) + FONT.symbol(SYM.PB_FULL) + FONT.symbol(SYM.PB_FULL) + FONT.symbol(SYM.PB_END) + FONT.symbol(SYM.PB_EMPTY) + FONT.symbol(SYM.PB_CLOSE)
    },
    ARMED_TIME: {
      name: 'ARMED_TIME',
      desc: 'osdDescElementArmedTime',
      default_position: -1,
      positionable: true,
      preview: FONT.symbol(SYM.FLY_M) + '02:07'
    },
    HOME_DIR: {
      name: 'HOME_DIRECTION',
      desc: 'osdDescElementHomeDirection',
      default_position: -1,
      positionable: true,
      preview: FONT.symbol(SYM.ARROW_SOUTH + 2)
    },
    HOME_DIST: {
      name: 'HOME_DISTANCE',
      desc: 'osdDescElementHomeDistance',
      default_position: -1,
      positionable: true,
      preview:  function(osd_data) {
        return '43' + FONT.symbol(osd_data.unit_mode === 0 ? SYM.FEET : SYM.METRE)
      }
    },
    NUMERICAL_HEADING: {
      name: 'NUMERICAL_HEADING',
      desc: 'osdDescElementNumericalHeading',
      default_position: -1,
      positionable: true,
      preview: FONT.symbol(SYM.ARROW_EAST) + '90'
    },
    NUMERICAL_VARIO: {
      name: 'NUMERICAL_VARIO',
      desc: 'osdDescElementNumericalVario',
      default_position: -1,
      positionable: true,
      preview: FONT.symbol(SYM.ARROW_NORTH) + '8.7'
    },
    COMPASS_BAR: {
      name: 'COMPASS_BAR',
      desc: 'osdDescElementCompassBar',
      default_position: -1,
      positionable: true,
      preview:  function(osd_data) {
        return FONT.symbol(SYM.HEADING_W)            + FONT.symbol(SYM.HEADING_LINE) + FONT.symbol(SYM.HEADING_DIVIDED_LINE) +
               FONT.symbol(SYM.HEADING_LINE)         + FONT.symbol(SYM.HEADING_N)    + FONT.symbol(SYM.HEADING_LINE) +
               FONT.symbol(SYM.HEADING_DIVIDED_LINE) + FONT.symbol(SYM.HEADING_LINE) + FONT.symbol(SYM.HEADING_E)
      }
    },
    WARNINGS: {
      name: 'WARNINGS',
      desc: 'osdDescElementWarnings',
      default_position: -1,
      positionable: true,
      preview: 'LOW VOLTAGE'
    },
    ESC_TEMPERATURE: {
      name: 'ESC_TEMPERATURE',
      desc: 'osdDescElementEscTemperature',
      default_position: -1,
      positionable: true,
      preview: FONT.symbol(SYM.TEMP_C) + '45'
    },
    ESC_RPM: {
      name: 'ESC_RPM',
      desc: 'osdDescElementEscRpm',
      default_position: -1,
      positionable: true,
      preview: '226000'
    },
    TIMER_1: {
      name: 'TIMER_1',
      desc: 'osdDescElementTimer1',
      default_position: -1,
      positionable: true,
      preview: function(osd_data) {
        return OSD.generateTimerPreview(osd_data, 0);
      }
    },
    TIMER_2: {
      name: 'TIMER_2',
      desc: 'osdDescElementTimer2',
      default_position: -1,
      positionable: true,
      preview: function(osd_data) {
        return OSD.generateTimerPreview(osd_data, 1);
      }
    },
  },
  ALL_STATISTIC_FIELDS: {
    MAX_SPEED: {
      name: 'MAX_SPEED',
      desc: 'osdDescStatMaxSpeed'
    },
    MIN_BATTERY: {
      name: 'MIN_BATTERY',
      desc: 'osdDescStatMinBattery'
    },
    MIN_RSSI: {
      name: 'MIN_RSSI',
      desc: 'osdDescStatMinRssi'
    },
    MAX_CURRENT: {
      name: 'MAX_CURRENT',
      desc: 'osdDescStatMaxCurrent'
    },
    USED_MAH: {
      name: 'USED_MAH',
      desc: 'osdDescStatUsedMah'
    },
    MAX_ALTITUDE: {
      name: 'MAX_ALTITUDE',
      desc: 'osdDescStatMaxAltitude'
    },
    BLACKBOX: {
      name: 'BLACKBOX',
      desc: 'osdDescStatBlackbox'
    },
    END_BATTERY: {
      name: 'END_BATTERY',
      desc: 'osdDescStatEndBattery'
    },
    FLYTIME: {
      name: 'FLY_TIME',
      desc: 'osdDescStatFlyTime'
    },
    ARMEDTIME: {
      name: 'ARMED_TIME',
      desc: 'osdDescStatArmedTime'
    },
    MAX_DISTANCE: {
      name: 'MAX_DISTANCE',
      desc: 'osdDescStatMaxDistance'
    },
    BLACKBOX_LOG_NUMBER: {
      name: 'BLACKBOX_LOG_NUMBER',
      desc: 'osdDescStatBlackboxLogNumber'
    },
    TIMER_1: {
      name: 'TIMER_1',
      desc: 'osdDescStatTimer1'
    },
    TIMER_2: {
      name: 'TIMER_2',
      desc: 'osdDescStatTimer2'
    }
  }
};

// Pick display fields by version, order matters, so these are going in an array... pry could iterate the example map instead
OSD.chooseFields = function () {
  var F = OSD.constants.ALL_DISPLAY_FIELDS;
  // version 3.0.1
  if (semver.gte(CONFIG.apiVersion, "1.21.0")) {
    OSD.constants.DISPLAY_FIELDS = [
      F.RSSI_VALUE,
      F.MAIN_BATT_VOLTAGE,
      F.CROSSHAIRS,
      F.ARTIFICIAL_HORIZON,
      F.HORIZON_SIDEBARS
    ];

    if (semver.lt(CONFIG.apiVersion, "1.36.0")) {
      OSD.constants.DISPLAY_FIELDS = OSD.constants.DISPLAY_FIELDS.concat([
        F.ONTIME,
        F.FLYTIME
      ]);
    } else {
      OSD.constants.DISPLAY_FIELDS = OSD.constants.DISPLAY_FIELDS.concat([
        F.TIMER_1,
        F.TIMER_2
      ]);
    }

    OSD.constants.DISPLAY_FIELDS = OSD.constants.DISPLAY_FIELDS.concat([
      F.FLYMODE,
      F.CRAFT_NAME,
      F.THROTTLE_POSITION,
      F.VTX_CHANNEL,
      F.CURRENT_DRAW,
      F.MAH_DRAWN,
      F.GPS_SPEED,
      F.GPS_SATS,
      F.ALTITUDE
    ]);
    if (semver.gte(CONFIG.apiVersion, "1.31.0")) {
      OSD.constants.DISPLAY_FIELDS = OSD.constants.DISPLAY_FIELDS.concat([
        F.PID_ROLL,
        F.PID_PITCH,
        F.PID_YAW,
        F.POWER
      ]);
      if (semver.gte(CONFIG.apiVersion, "1.32.0")) {
        OSD.constants.DISPLAY_FIELDS = OSD.constants.DISPLAY_FIELDS.concat([
          F.PID_RATE_PROFILE,
          semver.gte(CONFIG.apiVersion, "1.36.0") ? F.WARNINGS : F.BATTERY_WARNING,
          F.AVG_CELL_VOLTAGE
        ]);
        if (semver.gte(CONFIG.apiVersion, "1.34.0")) {
          OSD.constants.DISPLAY_FIELDS = OSD.constants.DISPLAY_FIELDS.concat([
            F.GPS_LON,
            F.GPS_LAT,
            F.DEBUG
          ]);
          if (semver.gte(CONFIG.apiVersion, "1.35.0")) {
            OSD.constants.DISPLAY_FIELDS = OSD.constants.DISPLAY_FIELDS.concat([
              F.PITCH_ANGLE,
              F.ROLL_ANGLE
            ]);
            if (semver.gte(CONFIG.apiVersion, "1.36.0")) {
              OSD.constants.DISPLAY_FIELDS = OSD.constants.DISPLAY_FIELDS.concat([
                F.MAIN_BATT_USAGE,
                F.DISARMED,
                F.HOME_DIR,
                F.HOME_DIST,
                F.NUMERICAL_HEADING,
                F.NUMERICAL_VARIO,
                F.COMPASS_BAR,
                F.ESC_TEMPERATURE,
                F.ESC_RPM
              ]);
            }
          }
        }
      }
    }
  }
  // version 3.0.0
  else {
    OSD.constants.DISPLAY_FIELDS = [
      F.MAIN_BATT_VOLTAGE,
      F.RSSI_VALUE,
      F.TIMER,
      F.THROTTLE_POSITION,
      F.CPU_LOAD,
      F.VTX_CHANNEL,
      F.VOLTAGE_WARNING,
      F.ARMED,
      F.DISARMED,
      F.ARTIFICIAL_HORIZON,
      F.HORIZON_SIDEBARS,
      F.CURRENT_DRAW,
      F.MAH_DRAWN,
      F.CRAFT_NAME,
      F.ALTITUDE
    ];
  }

  // Choose ststistic fields
  // Nothing much to do here, I'm preempting there being new statistics
  F = OSD.constants.ALL_STATISTIC_FIELDS;
  OSD.constants.STATISTIC_FIELDS = [
    F.MAX_SPEED,
    F.MIN_BATTERY,
    F.MIN_RSSI,
    F.MAX_CURRENT,
    F.USED_MAH,
    F.MAX_ALTITUDE,
    F.BLACKBOX,
    F.END_BATTERY,
    F.TIMER_1,
    F.TIMER_2,
    F.MAX_DISTANCE,
    F.BLACKBOX_LOG_NUMBER
  ];
};

OSD.updateDisplaySize = function() {
  var video_type = OSD.constants.VIDEO_TYPES[OSD.data.video_system];
  if (video_type == 'AUTO') {
    video_type = 'PAL';
  }
  
  // compute the size
  if (semver.gte(CONFIG.apiVersion, "1.36.0")) {
    // x/y size is set by msp update
  } else {
    OSD.data.display_size.x = FONT.constants.SIZES.LINE;
    OSD.data.display_size.y = OSD.constants.VIDEO_LINES[video_type];
  }
  OSD.data.display_size.total = OSD.data.display_size.x * OSD.data.display_size.y;
};


OSD.msp = {
  /**
   * Note, unsigned 16 bit int for position ispacked:
   * 0: unused
   * v: visible flag
   * b: blink flag
   * y: y coordinate
   * x: x coordinate
   * 0000 vbyy yyyx xxxx
   */
  helpers: {
    unpack: {
      position: function(data, c) {
        var display_item = {};
        if (semver.gte(CONFIG.apiVersion, "1.36.0")) {
          var x = data[0];
          var y = data[1];
          var isVisible = data[2];
          var origin = data[3];
          
          if (isVisible) console.debug("conv " + x + " " + y + "( " + origin + ")");
          // convert x,y to absolute, ORIGIN.NW based coordinates:
          // start on center
          var half_x = (OSD.data.display_size.x-1) / 2;
          var half_y = (OSD.data.display_size.y-1) / 2;
          x = x + half_x;
          y = y + half_y;
          
          if (origin & OSD.constants.ORIGIN.N){
            y = y - half_y;
          }
          if (origin & OSD.constants.ORIGIN.E){
            x = x + half_x;
          }
          if (origin & OSD.constants.ORIGIN.S){
            y = y + half_y;
          }
          if (origin & OSD.constants.ORIGIN.W){
            x = x - half_x;
          }
        
          // we just converted it to NW origin
          display_item.origin = OSD.constants.ORIGIN.NW;
          display_item.x = Math.ceil(x);
          display_item.y = Math.ceil(y);
          display_item.isVisible = isVisible;
        
          if (isVisible) console.debug("to " + x + " " + y + " (" + origin + ")" );
          
        } else if (semver.gte(CONFIG.apiVersion, "1.21.0")) {
          display_item.x = (data & 0x001F);
          display_item.y = ((data >> 5) & 0x001F);
          display_item.origin = OSD.constants.ORIGIN.NW;
          display_item.isVisible = (data & OSD.constants.VISIBLE) != 0;
        } else {
          var pos = (data === -1) ? c.default_position : data;
          display_item.x = (pos & 0x001F);
          display_item.y = ((pos >> 5) & 0x001F);
          display_item.origin = OSD.constants.ORIGIN.NW;
          display_item.isVisible = data !== -1;
        }
        if (display_item.isVisible) {
          console.debug("added display_item at " +
          " x: " + display_item.x + 
          " y: " + display_item.y + 
          " origin: " + display_item.origin + 
          " visbile: " + display_item.isVisible);
        }
        return display_item;
      },
      timer: function(bits, c) {
        var timer = {
          src: bits & 0x0F,
          precision: (bits >> 4) & 0x0F,
          alarm: (bits >> 8) & 0xFF
        };
        return timer;
      }
    },
    pack: {
      position: function(display_item) {
        if (semver.gte(CONFIG.apiVersion, "1.21.0")) {
          return (isVisible ? 0x0800 : 0) | (((display_item.y) & 0x001F) << 5) | (display_item.x);
        } else {
          return isVisible ? ((((display_item.y) & 0x001F) << 5) | (display_item.x)): -1;
        }
      },
      timer: function(timer) {
        return (timer.src & 0x0F) | ((timer.precision & 0x0F) << 4) | ((timer.alarm & 0xFF ) << 8);
      }
    }
  },
  encodeOther: function() {
    var result = [-1, OSD.data.video_system];
    if (OSD.data.state.haveOsdFeature && semver.gte(CONFIG.apiVersion, "1.36.0")) {
      result.push8(OSD.data.device);
      result.push16(OSD.data.enabledFeatures);
      result.push8(OSD.data.brightness.black);
      result.push8(OSD.data.brightness.white);
    }
    if (OSD.data.state.haveOsdFeature && semver.gte(CONFIG.apiVersion, "1.21.0")) {
      result.push8(OSD.data.unit_mode);
      // watch out, order matters! match the firmware
      result.push8(OSD.data.alarms.rssi.value);
      result.push16(OSD.data.alarms.cap.value);
      if (semver.lt(CONFIG.apiVersion, "1.36.0")) {
        result.push16(OSD.data.alarms.time.value);
      } else {
        // This value is unused by the firmware with configurable timers
        result.push16(0);
      }
      result.push16(OSD.data.alarms.alt.value);
    }
    return result;
  },
  encodeLayout: function(display_item) {
    var buffer = [];
    buffer.push8(display_item.index);
    if (semver.gte(CONFIG.apiVersion, "1.36.0")) {
      console.debug(
        "storing item " + display_item.name + 
        " x: " + display_item.x +
        " y: " + display_item.y +
        " origin: " + display_item.origin);
      buffer.push8(1); // screen id (0 = stats, else: normal)
      buffer.push8(display_item.x);
      buffer.push8(display_item.y);
      buffer.push8((display_item.origin << 4) | (display_item.isVisible?1:0));
    } else {
      buffer.push16(this.helpers.pack.position(display_item));
    }
    return buffer;
  },
  encodeStatistics: function(stat_item) {
    var buffer = [];
    buffer.push8(stat_item.index);
    buffer.push16(stat_item.enabled);
    buffer.push8(0);
    return buffer;
  },
  encodeTimer: function(timer) {
    var buffer = [-2, timer.index];
    buffer.push16(this.helpers.pack.timer(timer));
    return buffer;
  },
  // Currently only parses MSP_MAX_OSD responses, add a switch on payload.code if more codes are handled
  decode: function(payload) {
    var view = payload.data;
    var d = OSD.data;
    d.flags = view.readU8();

    if (d.flags > 0) {
      if (payload.length > 1) {
        d.video_system = view.readU8();
        if (semver.gte(CONFIG.apiVersion, "1.36.0")) {
          d.device = view.readU8();
          d.display_size.y   = view.readU8();
          d.display_size.x   = view.readU8();
          d.supportedFeatures = view.readU16();
          d.enabledFeatures  = view.readU16();
          d.brightness.black = view.readU8();
          d.brightness.white = view.readU8();
        }
        if (semver.gte(CONFIG.apiVersion, "1.21.0") && bit_check(d.flags, 0)) {
          d.unit_mode = view.readU8();
          d.alarms = {};
          d.alarms['rssi'] = { display_name: 'Rssi', value: view.readU8() };
          d.alarms['cap']= { display_name: 'Capacity', value: view.readU16() };
          if (semver.lt(CONFIG.apiVersion, "1.36.0")) {
            d.alarms['time'] = { display_name: 'Minutes', value: view.readU16() };
          } else {
            // This value is unused in configurable timers
            view.readU16();
          }
          d.alarms['alt'] = { display_name: 'Altitude', value: view.readU16() };
        }
      }
    }

    d.state = {};
    d.state.haveSomeOsd = (d.flags != 0)
    d.state.haveMax7456Video = bit_check(d.flags, 4) || (d.flags == 1 && semver.lt(CONFIG.apiVersion, "1.34.0"));
    d.state.haveOsdFeature = bit_check(d.flags, 0) || (d.flags == 1 && semver.lt(CONFIG.apiVersion, "1.34.0"));
    d.state.isOsdSlave = bit_check(d.flags, 1) && semver.gte(CONFIG.apiVersion, "1.34.0");

    d.display_items = [];
    d.stat_items = [];
    d.timers = [];

    OSD.updateDisplaySize();
    
    // Parse display element positions
    while (view.offset < view.byteLength && d.display_items.length < OSD.constants.DISPLAY_FIELDS.length) {
      var v = null;
      if (semver.gte(CONFIG.apiVersion, "1.36.0")) {
        var x = view.read8();
        var y = view.read8();
        var flags = view.read8();
        // console.debug("RX " + x + " " + y + " " + flags);
        var visible = (flags & 1) ? true : false;
        var origin = flags >> 4;
        
        v = [x, y, visible, origin];
      } else if (semver.gte(CONFIG.apiVersion, "1.21.0")) {
        v = view.readU16();
      } else {
        v = view.read16();
      }
      var j = d.display_items.length;
      var c = OSD.constants.DISPLAY_FIELDS[j];
      d.display_items.push($.extend({
        name: c.name,
        desc: c.desc,
        index: j,
        positionable: c.positionable,
        preview: c.preview
      }, this.helpers.unpack.position(v, c)));
    }

    if (semver.gte(CONFIG.apiVersion, "1.36.0")) {
      // Parse statistics display enable
      var expectedStatsCount = view.readU8();
      if (expectedStatsCount != OSD.constants.STATISTIC_FIELDS.length) {
        console.error("Firmware is transmitting a different number of statistics (" + expectedStatsCount + ") to what the configurator is expecting (" + OSD.constants.STATISTIC_FIELDS.length + ")");
      }
      while (view.offset < view.byteLength && d.stat_items.length < OSD.constants.STATISTIC_FIELDS.length) {
        var v = view.readU8();
        var j = d.stat_items.length;
        var c = OSD.constants.STATISTIC_FIELDS[j];
        d.stat_items.push({
          name: c.name,
          desc: c.desc,
          index: j,
          enabled: v === 1
        });
        expectedStatsCount--;
      }
      // Read all the data for any statistics we don't know about
      while (expectedStatsCount > 0) {
        view.readU8();
        expectedStatsCount--;
      }

      // Parse configurable timers
      var expectedTimersCount = view.readU8();
      while (view.offset < view.byteLength) {
        var v = view.readU16();
        var j = d.timers.length;
        d.timers.push($.extend({
          index: j,
        }, this.helpers.unpack.timer(v, c)));
        expectedTimersCount--;
      }
      // Read all the data for any timers we don't know about
      while (expectedTimersCount > 0) {
        view.readU16();
        expectedTimersCount--;
      }
    }

    // Generate OSD element previews that are defined by a function
    for (let item of d.display_items) {
      if (typeof(item.preview) === 'function') {
        item.preview = item.preview(d);
    }
}
  }
};

OSD.GUI = {};
OSD.GUI.preview = {
  onMouseEnter: function() {
    if (!$(this).data('field')) { return; }
    $('.field-'+$(this).data('field').index).addClass('mouseover')
  },
  onMouseLeave: function() {
    if (!$(this).data('field')) { return; }
    $('.field-'+$(this).data('field').index).removeClass('mouseover')
  },
  onDragStart: function(e) {
    var ev = e.originalEvent;
    ev.dataTransfer.setData("text/plain", $(ev.target).data('field').index);
    ev.dataTransfer.setDragImage($(this).data('field').preview_img, 6, 9);
  },
  onDragOver: function(e) {
    var ev = e.originalEvent;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = "move"
    $(this).css({
      background: 'rgba(0,0,0,.5)'
    });
  },
  onDragLeave: function(e) {
    // brute force unstyling on drag leave
    $(this).removeAttr('style');
  },
  onDrop: function(e) {
    var ev = e.originalEvent;
    
    var data = $(this).removeAttr('style').data('position');
    var field_id = parseInt(ev.dataTransfer.getData('text/plain'))
    var display_item = OSD.data.display_items[field_id];
    //var overflows_line = FONT.constants.SIZES.LINE - ((position % FONT.constants.SIZES.LINE) + display_item.preview.length);
    //if (overflows_line < 0) {
    //  position += overflows_line;
    //}
    //if (semver.gte(CONFIG.apiVersion, "1.21.0")) {
    //   unsigned now
    //} else {
    //  if (position > OSD.data.display_size.total/2) {
    //    position = position - OSD.data.display_size.total;
    //  }
    //}
    $('input.'+field_id+'.position').val(data).change();
  },
};


TABS.osd = {};
TABS.osd.initialize = function (callback) {
    var self = this;

    if (GUI.active_tab != 'osd') {
        GUI.active_tab = 'osd';
    }

    $('#content').load("./tabs/osd.html", function () {
        // translate to user-selected language
        localize();

        // Open modal window
        OSD.GUI.jbox = new jBox('Modal', {
            width: 600,
            height: 240,
            closeButton: 'title',
            animation: false,
            attach: $('#fontmanager'),
            title: 'OSD Font Manager',
            content: $('#fontmanagercontent')
        });

        // 2 way binding... sorta
        function updateOsdView() {
          // ask for the OSD config data
          MSP.promise(MSPCodes.MSP_OSD_CONFIG)
          .then(function(info) {

            OSD.chooseFields();

            OSD.msp.decode(info);

            if (OSD.data.state.haveSomeOsd == 0) {
              $('.unsupported').fadeIn();
              return;
            }
            $('.supported').fadeIn();

            // show Betaflight logo in preview
            var $previewLogo = $('.preview-logo').empty();
            $previewLogo.append(
              $('<label for="preview-logo">Logo: </label><input type="checkbox" name="preview-logo" class="togglesmall"></input>')
              .attr('checked', OSD.data.preview_logo)
              .change(function(e) {
                OSD.data.preview_logo = $(this).attr('checked') == undefined;
                updateOsdView();
              })
            );
            
            // OSD device
            if (semver.gte(CONFIG.apiVersion, "1.36.0")) {
              var OSDtypes = [
                'none',
                'MAX7456',
                'MSP',
                'openTCO'
              ];
      
              var osd_e = $('select.osd_device').empty();;
              for (var i = 0; i < OSDtypes.length; i++) {
                osd_e.append('<option value="' + i + '">' + OSDtypes[i] + '</option>');
              }

              osd_e.change(function () {
                OSD.data.device = parseInt($(this).val());
                MSP.promise(MSPCodes.MSP_SET_OSD_CONFIG, OSD.msp.encodeOther())
                .then(function() {
                  updateOsdView();
                });
              });

              // select current osd device
              osd_e.val(OSD.data.device);
            }

            // video mode
            var $videoTypes = $('.video-types').empty();
            for (var i = 0; i < OSD.constants.VIDEO_TYPES.length; i++) {
              var type = OSD.constants.VIDEO_TYPES[i];
              var $checkbox = $('<label/>').append($('<input name="video_system" type="radio"/>'+type+'</label>')
                .prop('checked', i === OSD.data.video_system)
                .data('type', type)
                .data('type', i)
              );
              $videoTypes.append($checkbox);
            }
            $videoTypes.find(':radio').click(function(e) {
              OSD.data.video_system = $(this).data('type');
              MSP.promise(MSPCodes.MSP_SET_OSD_CONFIG, OSD.msp.encodeOther())
              .then(function() {
                updateOsdView();
              });
            });
            
            if (semver.gte(CONFIG.apiVersion, "1.36.0")) {
             
              if (OSD.data.supportedFeatures !== 0) {
                // featureset
                $('.video-features-container').show();
                var $videoFeatures = $('.osd_features').empty();
                
                var $enabledFeatureUpdateFunction = function(){
                  if ($(this).prop('checked')) {
                    OSD.data.enabledFeatures |= $(this).data('flag');
                  } else {
                    OSD.data.enabledFeatures &= ~$(this).data('flag');
                  }
                  MSP.promise(MSPCodes.MSP_SET_OSD_CONFIG, OSD.msp.encodeOther())
                  .then(function() {
                    updateOsdView();
                  });
                };
                
                // add all items:
                for (var $featureKey in OSD.constants.FEATURES) {
                  var $featureFlag = OSD.constants.FEATURES[$featureKey];
                  
                  if (OSD.data.supportedFeatures & $featureFlag) {
                    var $checkbox = $('<input type="checkbox" class="togglesmall"/>');
                    
                    $checkbox.prop('checked', (OSD.data.enabledFeatures & $featureFlag) ? true : false);
                    $checkbox.data('flag', $featureFlag);
                    
                    $checkbox.change($enabledFeatureUpdateFunction);
                  
                    
                    var $field = $('<div class="switchable-field"/>');
                    $field.append($checkbox)
                    $field.append('<label>'+$featureKey+'</label');
                    $videoFeatures.append($field);
                  }
                }
              }
              
              // invert video overlay?
              //var $videoInvert = $('.videoInvert').empty(); //input[name="videoInvert2"]').empty();
              //
              //var $checkbox = $('<input type="checkbox" class="togglesmall"/>');
              //$checkbox.prop('checked', OSD.data.invert);
              //$checkbox.change(function (){
                //OSD.data.invert = $(this).prop('checked');
                //MSP.promise(MSPCodes.MSP_SET_OSD_CONFIG, OSD.msp.encodeOther())
                //.then(function() {
                  //updateOsdView();
//                });
              //});
              //$videoInvert.append("<label>Invert: </label>");
              //$videoInvert.append($checkbox);
               
              // video brightness
              $('.video-brightness-container').show();
              
              var $videoBrightnessWhite = $('.videoBrightnessWhite').empty();
              var $wnumber = $('<input type="number" step="1" min="0" max="100"/>').val(OSD.data.brightness.white);
              var $wrange = $('<input type="range"step="0" min="0" max="100"/>').val(OSD.data.brightness.white);
              
              $wnumber.change(function () {
                $wrange.val($(this).val());
                OSD.data.brightness.white = $(this).val();
              });
              $wrange.change(function () {
                $wnumber.val($(this).val());
                OSD.data.brightness.white = $(this).val();
                MSP.promise(MSPCodes.MSP_SET_OSD_CONFIG, OSD.msp.encodeOther())
                .then(function() {
                  updateOsdView();
                });
              });
            
              $videoBrightnessWhite.append($wnumber);
              $videoBrightnessWhite.append($wrange);
              $videoBrightnessWhite.append('<label> WHITE</label>');
              
              var $videoBrightnessBlack = $('.videoBrightnessBlack').empty();
              var $bnumber = $('<input type="number" step="1" min="0" max="100"/>').val(OSD.data.brightness.black);
              var $brange = $('<input type="range"step="0" min="0" max="100"/>').val(OSD.data.brightness.black);
              
              $bnumber.change(function () {
                $brange.val($(this).val());
                OSD.data.brightness.black = $(this).val();
              });
              $brange.change(function () {
                $bnumber.val($(this).val());
                OSD.data.brightness.black = $(this).val();
                MSP.promise(MSPCodes.MSP_SET_OSD_CONFIG, OSD.msp.encodeOther())
                .then(function() {
                  updateOsdView();
                });
              });
            
              $videoBrightnessBlack.append($bnumber);
              $videoBrightnessBlack.append($brange);
              $videoBrightnessBlack.append('<label> BLACK</label>');
              
            }

            if (semver.gte(CONFIG.apiVersion, "1.21.0")) {
              // units
              $('.units-container').show();
              var $unitMode = $('.units').empty();
              for (var i = 0; i < OSD.constants.UNIT_TYPES.length; i++) {
                var type = OSD.constants.UNIT_TYPES[i];
                var $checkbox = $('<label/>').append($('<input name="unit_mode" type="radio"/>'+type+'</label>')
                  .prop('checked', i === OSD.data.unit_mode)
                  .data('type', type)
                  .data('type', i)
                );
                $unitMode.append($checkbox);
              }
              $unitMode.find(':radio').click(function(e) {
                OSD.data.unit_mode = $(this).data('type');
                MSP.promise(MSPCodes.MSP_SET_OSD_CONFIG, OSD.msp.encodeOther())
                .then(function() {
                  updateOsdView();
                });
              });
              // alarms
              $('.alarms-container').show();
              var $alarms = $('.alarms').empty();
              for (let k in OSD.data.alarms) {
                var alarm = OSD.data.alarms[k];
                var alarmInput = $('<input name="alarm" type="number" id="'+k+'"/>'+alarm.display_name+'</label>');
                alarmInput.val(alarm.value);
                alarmInput.blur(function(e) {
                  OSD.data.alarms[$(this)[0].id].value = $(this)[0].value;
                  MSP.promise(MSPCodes.MSP_SET_OSD_CONFIG, OSD.msp.encodeOther())
                  .then(function() {
                    updateOsdView();
                  });
                });
                var $input = $('<label/>').append(alarmInput);
                $alarms.append($input);
              }

              if (semver.gte(CONFIG.apiVersion, "1.36.0")) {
                // Timers
                $('.timers-container').show();
                var $timers = $('#timer-fields').empty();
                for (let tim of OSD.data.timers) {
                  var $timerConfig = $('<div class="switchable-field field-' + tim.index + '"/>');

                  // Timer number
                  $timerConfig.append('<span>' + (tim.index + 1) + '</span>');

                  // Source
                  var src = $('<select class="timer-option osd_tip" id="' + tim.index + '"></select>');
                  src.attr('title', chrome.i18n.getMessage('osdTimerSourceTooltip'));
                  OSD.constants.TIMER_TYPES.forEach(function(e, i) {
                    src.append('<option value="' + i + '">' + e + '</option>');
                  });
                  src[0].selectedIndex = tim.src;
                  src.blur(function(e) {
                    OSD.data.timers[$(this)[0].id].src = $(this)[0].selectedIndex;
                    MSP.promise(MSPCodes.MSP_SET_OSD_CONFIG, OSD.msp.encodeTimer(OSD.data.timers[$(this)[0].id]))
                    .then(function() {
                      updateOsdView();
                    });
                  });
                  $timerConfig.append(src);

                  // Precision
                  var precision = $('<select class="timer-option osd_tip" id="' + tim.index + '"></select>');
                  precision.attr('title', chrome.i18n.getMessage('osdTimerPrecisionTooltip'));
                  OSD.constants.TIMER_PRECISION.forEach(function(e, i) {
                    precision.append('<option value="' + i + '">' + e + '</option>');
                  });
                  precision[0].selectedIndex = tim.precision;
                  precision.blur(function(e) {
                    OSD.data.timers[$(this)[0].id].precision = $(this)[0].selectedIndex;
                    MSP.promise(MSPCodes.MSP_SET_OSD_CONFIG, OSD.msp.encodeTimer(OSD.data.timers[$(this)[0].id]))
                    .then(function() {
                      updateOsdView();
                    });
                  });
                  $timerConfig.append(precision);

                  // Alarm
                  var alarm = $('<input class="timer-option osd_tip" name="alarm" type="number" min=0 id="' + tim.index + '"/>');
                  alarm.attr('title', chrome.i18n.getMessage('osdTimerAlarmTooltip'));
                  alarm[0].value = tim.alarm;
                  alarm.blur(function(e) {
                    OSD.data.timers[$(this)[0].id].alarm = $(this)[0].value;
                    MSP.promise(MSPCodes.MSP_SET_OSD_CONFIG, OSD.msp.encodeTimer(OSD.data.timers[$(this)[0].id]))
                    .then(function() {
                      updateOsdView();
                    });
                  });
                  $timerConfig.append(alarm);

                  $timers.append($timerConfig);
                }

                // Post flight statistics
                $('.stats-container').show();
                var $statsFields = $('#post-flight-stat-fields').empty();

                for (let field of OSD.data.stat_items) {
                  if (!field.name) { continue; }

                  var $field = $('<div class="switchable-field field-'+field.index+'"/>');
                  var desc = null;
                  if (field.desc && field.desc.length) {
                    desc = chrome.i18n.getMessage(field.desc);
                  }
                  if (desc && desc.length) {
                    $field[0].classList.add('osd_tip');
                    $field.attr('title', desc);
                  }
                  $field.append(
                    $('<input type="checkbox" name="'+field.name+'" class="togglesmall"></input>')
                    .data('field', field)
                    .attr('checked', field.enabled)
                    .change(function(e) {
                      var field = $(this).data('field');
                      field.enabled = !field.enabled;
                      MSP.promise(MSPCodes.MSP_SET_OSD_CONFIG, OSD.msp.encodeStatistics(field))
                      .then(function() {
                        updateOsdView();
                      });
                    })
                  );
                  $field.append('<label for="'+field.name+'" class="char-label">'+inflection.titleize(field.name)+'</label>');

                  $statsFields.append($field);
                }
              }
            }

            if (!OSD.data.state.haveMax7456Video) {
              $('.requires-max7456').hide();
            }

            if (!OSD.data.state.haveOsdFeature) {
              $('.requires-osd-feature').hide();
            }

            // display fields on/off and position
            var $displayFields = $('#element-fields').empty();
            for (let field of OSD.data.display_items) {
              // versioning related, if the field doesn't exist at the current flight controller version, just skip it
              if (!field.name) { continue; }
              var checked = field.isVisible ? 'checked' : '';
              var $field = $('<div class="switchable-field field-'+field.index+'"/>');
              var desc = null;
              if (field.desc && field.desc.length) {
                desc = chrome.i18n.getMessage(field.desc);
              }
              if (desc && desc.length) {
                $field[0].classList.add('osd_tip');
                $field.attr('title', desc);
              }
              $field.append(
                $('<input type="checkbox" name="'+field.name+'" class="togglesmall"></input>')
                .data('field', field)
                .attr('checked', field.isVisible)
                .change(function(e) {
                  var field = $(this).data('field');
                  var $position = $(this).parent().find('.position.'+field.name);
                  field.isVisible = !field.isVisible;
                  if (field.isVisible) {
                    $position.show();
                  } else {
                    $position.hide();
                  }
                  MSP.promise(MSPCodes.MSP_SET_OSD_CONFIG, OSD.msp.encodeLayout(field))
                  .then(function() {
                    updateOsdView();
                  });
                })
              );
              $field.append('<label for="'+field.name+'" class="char-label">'+inflection.titleize(field.name)+'</label>');
              if (field.positionable && field.isVisible) {
                $field.append(
                  $('<input type="text" class="'+field.index+' position">')
                  .data('field', field)
                  .val(field.x)
                  .val(field.y)
                  .change($.debounce(250, function(e) {
                    var field = $(this).data('field');
                    var data = $(this).val().split(',').map(Number);
                    var pos = { x: data[0], y: data[1] }
                    
                    var max_x = OSD.data.display_size.x - 1;
                    var max_y = OSD.data.display_size.y - 1;
                    
                    var origin_coordinate = {};
                    origin_coordinate[OSD.constants.ORIGIN.C] = { x: Math.ceil(max_x/2), y: Math.ceil(max_y/2)};
                    origin_coordinate[OSD.constants.ORIGIN.N] = { x: Math.ceil(max_x/2), y: 0};
                    origin_coordinate[OSD.constants.ORIGIN.E] = { x: max_x, y: Math.ceil(max_y/2)};
                    origin_coordinate[OSD.constants.ORIGIN.S] = { x: Math.ceil(max_x/2), y: max_y};
                    origin_coordinate[OSD.constants.ORIGIN.W] = { x: 0, y: Math.ceil(max_y/2)};
                    origin_coordinate[OSD.constants.ORIGIN.NE] = { x: max_x, y: 0};
                    origin_coordinate[OSD.constants.ORIGIN.SE] = { x: max_x, y: max_y};
                    origin_coordinate[OSD.constants.ORIGIN.SW] = { x: 0, y: max_y};
                    origin_coordinate[OSD.constants.ORIGIN.NW] = { x: 0, y: 0};
                    
                    
                    // calculate closest origin:
                    var best_dist = Infinity;
                    var best_origin = 0;
                    for (var origin_key in OSD.constants.ORIGIN) {
                      var origin = OSD.constants.ORIGIN[origin_key];
                      var dist = Math.sqrt(
                        Math.pow(pos.x - origin_coordinate[origin].x, 2) + 
                        Math.pow(pos.y - origin_coordinate[origin].y, 2));
                      if (dist < best_dist) {
                        best_dist = dist;
                        best_origin = origin;
                      }
                    }
                    
                    // input is normal x,y coordinate (=ORIGIN_NW)
                    // convert to relative to closest origin
                    field.x = pos.x - origin_coordinate[best_origin].x;
                    field.y = pos.y - origin_coordinate[best_origin].y;
                    field.origin  = best_origin;
                    
                    MSP.promise(MSPCodes.MSP_SET_OSD_CONFIG, OSD.msp.encodeLayout(field))
                    .then(function() {
                      updateOsdView();
                    });
                  }))
                );
              }
              $displayFields.append($field);
            }
            GUI.switchery();
            // buffer the preview
            OSD.data.preview = [];
            for (var y=0; y < OSD.data.display_size.y; y++) {
              OSD.data.preview[y] = [];
            }
            
            // FIXME: handle off screen items here
            //for(let field of OSD.data.display_items) {
            //  // reset fields that somehow end up off the screen
            //  if (field.position > OSD.data.display_size.total) {
            //    field.position = 0;
            //  }
            //}
            
            // clear the buffer
            for (var y=0; y < OSD.data.display_size.y; y++) {
              for (var x=0; x < OSD.data.display_size.x; x++) {
                OSD.data.preview[y].push([null, ' '.charCodeAt(0)]);
              }
            }
            // logo first, so it gets overwritten by subsequent elements
            if (OSD.data.preview_logo) {
              var charcode = 160;
              for (var y = 1; y < 5; y++) {
                for (var x = 3; x < 27; x++){
                    OSD.data.preview[y][x] = [{name: 'LOGO', positionable: false}, charcode++];
                }
              }
            }
            // draw all the displayed items and the drag and drop preview images
            for(let field of OSD.data.display_items) {
              if (!field.preview || !field.isVisible) { continue; }
              
              // create the preview image
              field.preview_img = new Image();
              var canvas = document.createElement('canvas');
              var ctx = canvas.getContext("2d");
              // fill the screen buffer
              for(var i = 0; i < field.preview.length; i++) {
                var charCode = field.preview.charCodeAt(i);
                var y = field.y;
                var x = field.x + i;
                if (x >= OSD.data.display_size.x) {
                  console.log('display_item ', field.name, ' x pos exceeded (', x , ')');
                } else if (y >= OSD.data.display_size.y) {
                  console.log('display_item ', field.name, ' y pos exceeded (', y , ')');
                } else {
                  // charCodeA to add 
                  console.log('display_item ', field.name, ' safe to add');
                  OSD.data.preview[y][x] = [field, charCode];
                  // draw the preview
                  var img = new Image();
                  img.src = FONT.draw(charCode);
                  ctx.drawImage(img, i*12, 0);
                }
              }
              field.preview_img.src = canvas.toDataURL('image/png');
            }
            var centerishPositionX = Math.ceil(OSD.data.display_size.x / 2);
            var centerishPositionY = Math.ceil(OSD.data.display_size.y / 2);
            
            // artificial horizon
            if ($('input[name="ARTIFICIAL_HORIZON"]').prop('checked')) {
              for (var i = 0; i < 9; i++) {
                OSD.data.preview[centerishPositionY][centerishPositionX - 4 + i] = SYM.AH_BAR9_0 + 4;
              }
            }
            // crosshairs
            if ($('input[name="CROSSHAIRS"]').prop('checked')) {
              OSD.data.preview[centerishPositionY][centerishPositionX - 1] = SYM.AH_CENTER_LINE;
              OSD.data.preview[centerishPositionY][centerishPositionX + 1] = SYM.AH_CENTER_LINE_RIGHT;
              OSD.data.preview[centerishPositionY][centerishPositionX]     = SYM.AH_CENTER;
            }
            // sidebars
            if ($('input[name="HORIZON_SIDEBARS"]').prop('checked')) {
              var hudwidth  = OSD.constants.AHISIDEBARWIDTHPOSITION;
              var hudheight = OSD.constants.AHISIDEBARHEIGHTPOSITION;
              for (var i = -hudheight; i <= hudheight; i++) {
                OSD.data.preview[centerishPositionY + i][centerishPositionX - hudwidth] = SYM.AH_DECORATION;
                OSD.data.preview[centerishPositionY + i][centerishPositionX + hudwidth] = SYM.AH_DECORATION;
              }
              // AH level indicators
              OSD.data.preview[centerishPositionY][centerishPositionX - hudwidth + 1] =  SYM.AH_LEFT;
              OSD.data.preview[centerishPositionY][centerishPositionX + hudwidth - 1] =  SYM.AH_RIGHT;
            }
            // render
            var $preview = $('.display-layout .preview').empty();
            
            $('.display-layout .preview').width((OSD.data.display_size.x * FONT.constants.SIZES.CHAR_WIDTH) + "px");
            $('.display-layout').width((OSD.data.display_size.x * FONT.constants.SIZES.CHAR_WIDTH) + "px");
            var $row = $('<div class="row"/>');
            for (var y=0; y < OSD.data.display_size.y; y++) {
              for (var x=0; x < OSD.data.display_size.x; x++) {
                var preview_item = OSD.data.preview[y][x];
                
                if (typeof preview_item === 'object') {
                  var field    = preview_item[0];
                  var charCode = preview_item[1];
                  if (field) {
                    var origin   = field.origin;
                  } else {
                    var origin   = 0;
                  }
                } else {
                  var charCode = preview_item;
                  var origin   = 0;
                }
                var $img = $('<div class="char" draggable><img src='+FONT.draw(charCode)+'></img></div>')
                  .on('mouseenter', OSD.GUI.preview.onMouseEnter)
                  .on('mouseleave', OSD.GUI.preview.onMouseLeave)
                  .on('dragover', OSD.GUI.preview.onDragOver)
                  .on('dragleave', OSD.GUI.preview.onDragLeave)
                  .on('drop', OSD.GUI.preview.onDrop)
                  .data('field', field)
                  .data('position', x.toString() + "," + y.toString())
                if (field && field.positionable) {
                  $img
                    .addClass('field-'+field.index)
                    .data('field', field)
                    .prop('draggable', true)
                    .on('dragstart', OSD.GUI.preview.onDragStart);
                }
                else {
                }
                $row.append($img);
                
              }
              $preview.append($row);
              $row = $('<div class="row"/>');
            }
            
            // Remove last tooltips
            for (var tt of OSD.data.tooltips) {
              tt.destroy();
            }
            OSD.data.tooltips = [];

            // Generate tooltips for OSD elements
            $('.osd_tip').each(function() {
                OSD.data.tooltips.push($(this).jBox('Tooltip', {
                    delayOpen: 100,
                    delayClose: 100,
                    position: {
                        x: 'right',
                        y: 'center'
                    },
                    outside: 'x'
                    }));
            });
          });
        };

        $('a.save').click(function() {
          var self = this;
          MSP.promise(MSPCodes.MSP_EEPROM_WRITE);
          GUI.log('OSD settings saved');
          var oldText = $(this).text();
          $(this).html("Saved");
          setTimeout(function () {
              $(self).html(oldText);
          }, 2000);
        });

        // font preview window
        var $preview = $('.font-preview');

        //  init structs once, also clears current font
        FONT.initData();

        var $fontPicker = $('.fontbuttons button');
        $fontPicker.click(function(e) {
          if (!$(this).data('font-file')) { return; }
          $fontPicker.removeClass('active');
          $(this).addClass('active');
          $.get('./resources/osd/' + $(this).data('font-file') + '.mcm', function(data) {
            FONT.parseMCMFontFile(data);
            FONT.preview($preview);
            updateOsdView();
          });
        });

        // load the first font when we change tabs
        $fontPicker.first().click();

        $('button.load_font_file').click(function() {
          $fontPicker.removeClass('active');
          FONT.openFontFile().then(function() {
            FONT.preview($preview);
            updateOsdView();
          });
        });

        // font upload
        $('a.flash_font').click(function () {
            if (!GUI.connect_lock) { // button disabled while flashing is in progress
                $('a.flash_font').addClass('disabled');
                $('.progressLabel').text('Uploading...');
                FONT.upload($('.progress').val(0)).then(function() {
                    var msg = 'Uploaded all ' + FONT.data.characters.length + ' characters';
                    console.log(msg);
                    $('.progressLabel').text(msg);
                });
            }
        });

        $(document).on('click', 'span.progressLabel a.save_font', function () {
            chrome.fileSystem.chooseEntry({type: 'saveFile', suggestedName: 'baseflight', accepts: [{extensions: ['mcm']}]}, function (fileEntry) {
                if (chrome.runtime.lastError) {
                    console.error(chrome.runtime.lastError.message);
                    return;
                }

                chrome.fileSystem.getDisplayPath(fileEntry, function (path) {
                    console.log('Saving firmware to: ' + path);

                    // check if file is writable
                    chrome.fileSystem.isWritableEntry(fileEntry, function (isWritable) {
                        if (isWritable) {
                            var blob = new Blob([intel_hex], {type: 'text/plain'});

                            fileEntry.createWriter(function (writer) {
                                var truncated = false;

                                writer.onerror = function (e) {
                                    console.error(e);
                                };

                                writer.onwriteend = function() {
                                    if (!truncated) {
                                        // onwriteend will be fired again when truncation is finished
                                        truncated = true;
                                        writer.truncate(blob.size);

                                        return;
                                    }
                                };

                                writer.write(blob);
                            }, function (e) {
                                console.error(e);
                            });
                        } else {
                            console.log('You don\'t have write permissions for this file, sorry.');
                            GUI.log('You don\'t have <span style="color: red">write permissions</span> for this file');
                        }
                    });
                });
            });
        });

        $(document).keypress(function (e) {
            if (e.which == 13) { // enter
                // Trigger regular Flashing sequence
                $('a.flash_font').click();
            }
        });

        GUI.content_ready(callback);
    });
};

TABS.osd.cleanup = function (callback) {
    PortHandler.flush_callbacks();

    // unbind "global" events
    $(document).unbind('keypress');
    $(document).off('click', 'span.progressLabel a');

    if (callback) callback();
};
