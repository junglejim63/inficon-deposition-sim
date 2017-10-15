const SerialPort = require('serialport');
const repl = require('repl');
const numeral = require('numeral');

function timeToString(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = numeral(seconds % 60).format('00');
  return `${mins.toString()}:${secs.toString()}`;
}

function receive(buf, me) {
  me.received = buf.toString('ascii');
  console.log(`Msg: ${me.received}`);
  me.cmd = me.received.match(/^([A-Z])(\s+\d+)?(\s+[\d.:]+)?(\s+[\d.:]+)?(\s+[\d.:]+)?(\s+[\d.:]+)?(\s+[\d.:]+)?(\s+[\d.:]+)?(\s+[\d.:]+)?/);
  if (me.cmd === null) {
    me.send('D', false); return; // Illegal command format
  }
  // strip out leading spaces from result
  for (let i = 0; i < 10; i++) {
    if (typeof me.cmd[i] === 'string') me.cmd[i] = me.cmd[i].trim();
  }
  switch (me.cmd[1]) {
  case 'E': // Echo Command
    me.port.write(me.lastMsg);
    break;
  case 'H': // Hello Command
    me.send('XTM/2 VERSION 1.23', true); // Illegal command
    break;
  case 'Q': // Query Command
    me.query();
    break;
  case 'U': // Update Command
    me.update();
    break;
  case 'S': // Status Command
    me.status();
    break;
  case 'R': // Remote Command
    me.remote();
    break;
  default:
    me.send('A', false); // Illegal command
    break;
  }
}

class Film {
  constructor(offset) {
    this.tooling = 100.0 + offset;
    this.finalThickness = 20.0 + offset;
    this.SPTThickness = 10.0 + offset;
    this.density = 30.0 + (offset / 10.0);
    this.zRatio = 2.0 + (offset / 10.0);
    this.SPTTime = (80 * 60) + offset;
    this.filmNum = offset;
  }
}

class Inficon {
  constructor(port, baud) {
    this.d = {}; // data object for all simulated values
    this.d.films = [];
    for (let i = 1; i < 10; i++) {
      this.d.films.push(new Film(i));
    }
    this.d.name = 'Inficon Xtal thickness checker';
    this.d.rate = 0;
    this.d.thickness = 0;
    this.d.depositTime = 0;
    this.d.film = 0;
    this.d.crystalLife = 50.0;
    this.d.outputs = [false, false, false, false];
    this.d.inputs = [false, false, false, false, false];
    this.d.xtalFrequency = { status: true, value: 34.4, averaging: 1 };
    this.d.powerupErrors = {
      paramChecksum: false,
      stbyOn: true, // true on startup
      linePower: false,
      procDataChecksum: false,
    };
    this.d.configSwitches = [];
    this.d.shutter = false;
    this.d.frontLockout = false;
    this.d.outputOverride = false;
    for (let i = 0; i < 16; i++) this.d.configSwitches.push(false);

    // Setup serial port
    this.port = new SerialPort(port, {
      baudRate: baud,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      rtscts: false,
    });
    this.parser = this.port.pipe(new SerialPort.parsers.Delimiter({
      delimiter: Buffer.from('06', 'hex'),
    }));
    this.parser.on('data', (buf) => { receive(buf, this); });
    this.received = '';
    this.lastMsg = 'G \x21';
    this.cmd = '';
  }

  query() {
    if (this.d.filmNOK()) { this.send('C', false); return; } // Illegal ID
    const film = parseInt(this.cmd[3], 10); // all queries and updates are to films
    const p0 = this.d.films[film - 1].tooling.toString();
    const p1 = this.d.films[film - 1].finalThickness.toString();
    const p2 = this.d.films[film - 1].SPTThickness.toString();
    const p3 = this.d.films[film - 1].density.toString();
    const p4 = this.d.films[film - 1].zRatio.toString();
    const p5 = timeToString(this.d.films[film - 1].SPTTime);
    const p6 = (this.d.film + 1).toString();
    switch (this.cmd[2]) {
    case '0': // Tooling
      this.send(p0, true);
      break;
    case '1': // Final Thickness
      this.send(p1, true);
      break;
    case '2': // SPT Thickness
      this.send(p2, true);
      break;
    case '3': // Density
      this.send(p3, true);
      break;
    case '4': // Z-ratio
      this.send(p4, true);
      break;
    case '5': // SPT Timer
      this.send(p5, true);
      break;
    case '6': // Current Film Number
      this.send(p6, true);
      break;
    case '99': // params 0-5
      this.send(`${p0} ${p1} ${p2} ${p3} ${p4} ${p5}`, true);
      break;
    default:
      this.send('B', false); // Illegal value
      break;
    }
  }

  update() {
    if (this.d.filmNOK()) { this.send('C', false); return; } // Illegal ID
    const [, , param, filmarg, a0, a1, a2, a3, a4, a5] = this.cmd;
    const film = parseInt(filmarg, 10); // all queries and updates are to films
    if (typeof a0 === 'undefined') { this.send('B', false); return; } // Illegal value
    let p0 = null;
    let p1 = null;
    let p2 = null;
    let p3 = null;
    let p4 = null;
    let p5 = null;
    let p6 = null;
    // make sure all arguments for 99 have been provided
    if (param === '99' &&
      (typeof a0 === 'undefined' ||
      typeof a1 === 'undefined' ||
      typeof a2 === 'undefined' ||
      typeof a3 === 'undefined' ||
      typeof a4 === 'undefined' ||
      typeof a5 === 'undefined')) { this.send('B', false); return; } // Illegal value
    if (param === '0') {
      p0 = a0;
    } else if (param === '1') {
      p1 = a0;
    } else if (param === '2') {
      p2 = a0;
    } else if (param === '3') {
      p3 = a0;
    } else if (param === '4') {
      p4 = a0;
    } else if (param === '5') {
      p5 = a0;
    } else if (param === '6') {
      p6 = a0;
    } else if (param === '99') {
      p0 = a0;
      p1 = a1;
      p2 = a2;
      p3 = a3;
      p4 = a4;
      p5 = a5;
    } else {
      // illegal command
      this.send('C', false);
      return;
    }
    // Tooling
    if (p0 !== null) {
      const fValue = parseFloat(p0);
      if (Number.isNaN(fValue) || fValue < 10 || fValue > 500.9) {
        this.send('B', false);
        return;
      }
      this.d.films[film - 1].tooling = fValue;
    }
    // final thickness
    if (p1 !== null) {
      const fValue = parseFloat(p1);
      if (Number.isNaN(fValue) || fValue < 0 || fValue > 999.9999) {
        this.send('B', false);
        return;
      }
      this.d.films[film - 1].finalThickness = fValue;
    }
    // SPT thickness
    if (p2 !== null) {
      const fValue = parseFloat(p2);
      if (Number.isNaN(fValue) || fValue < 0 || fValue > 999.9999) {
        this.send('B', false);
        return;
      }
      this.d.films[film - 1].SPTThickness = fValue;
    }
    // density
    if (p3 !== null) {
      const fValue = parseFloat(p3);
      if (Number.isNaN(fValue) || fValue < 0.5 || fValue > 99.999) {
        this.send('B', false);
        return;
      }
      this.d.films[film - 1].density = fValue;
    }
    // z ratio
    if (p4 !== null) {
      const fValue = parseFloat(p4);
      if (Number.isNaN(fValue) || fValue < 0.1 || fValue > 9.999) {
        this.send('B', false);
        return;
      }
      this.d.films[film - 1].zRatio = fValue;
    }
    // SPTTime
    if (p5 !== null) {
      const re = p5.match(/^(\d\d):(\d\d)$/);
      if (re === null) { this.send('B', false); return; }
      const [, min, sec] = re;
      const secs = (parseInt(min, 10) * 60) + parseInt(sec, 10);
      if (secs < 0 || secs > 5999) {
        this.send('B', false);
        return;
      }
      this.d.films[film - 1].SPTTime = secs;
    }
    // current film
    if (p6 !== null) {
      this.d.film = parseInt(p6, 10) - 1;
    }
    this.send('', true); // TODO - do not know response for Update wuery
  }

  status() {
    const [, , param] = this.cmd;
    let txt;
    let i;
    let sep = '';
    switch (param) {
    case '0': // Rate, Thickness, Time, Xtal-Life
      this.send(`${this.d.rate} ${this.d.thickness} ${timeToString(this.d.depositTime)} ${this.d.crystalLife}`, true);
      break;
    case '1': // rate
      this.send(`${this.d.rate}`, true);
      break;
    case '2': // Thickness
      this.send(`${this.d.thickness}`, true);
      break;
    case '3': // deposit time
      this.send(`${timeToString(this.d.depositTime)}`, true);
      break;
    case '4': // Film
      this.send(`${this.d.film + 1}`, true);
      break;
    case '5': // Crystal Life
      this.send(`${this.d.crystalLife}`, true);
      break;
    case '6': // Output Status
      txt = '0000';
      for (i = 3; i >= 0; i--) {
        txt += this.d.outputs[i] ? '1' : '0';
      }
      this.send(`${txt}`, true);
      break;
    case '7': // Input Status
      txt = '000';
      for (i = 4; i >= 0; i--) {
        txt += this.d.inputs[i] ? '1' : '0';
      }
      this.send(`${txt}`, true);
      break;
    case '8': // crystal frequency
      txt = this.d.xtalFrequency.status ? ' ' : '-';
      txt += numeral(this.d.xtalFrequency.value).format('000000.0');
      if (this.d.xtalFrequency.averaging === 0.25) {
        txt += 0;
      } else if (this.d.xtalFrequency.averaging === 4) {
        txt += 2;
      } else if (this.d.xtalFrequency.averaging === 16) {
        txt += 1;
      } else {
        txt += 5;
      }
      this.send(`${txt}`, true);
      break;
    case '9': // Crystal Fail
      txt = this.d.xtalFrequency.status ? '0' : '1';
      this.send(`${txt}`, true);
      break;
    case '10': // Config switch settings
      txt = '';
      for (i = 15; i >= 0; i--) {
        txt += this.d.configSwitches[i] ? '1' : '0';
      }
      this.send(`${txt}`, true);
      break;
    case '11': // Power-up Errors
      txt = '';
      if (this.d.powerupErrors.paramChecksum) { txt += `0${sep}`; sep = ' '; }
      if (this.d.powerupErrors.stbyOn) { txt += `1${sep}`; sep = ' '; }
      if (this.d.powerupErrors.linePower) { txt += `2${sep}`; sep = ' '; }
      if (this.d.powerupErrors.procDataChecksum) { txt += `9${sep}`; sep = ' '; }
      if (txt === '') txt = '10';
      this.send(`${txt}`, true);
      this.d.powerupErrors.stbyOn = false; // reset on read
      break;
    case '12': // Datalog Ouutput
      this.send('TODO: Unsupported in Sim', true);
      break;
    case '13': // Config switch settings
      txt = '';
      for (i = 15; i >= 0; i--) {
        txt += this.d.configSwitches[i] ? '1' : '0';
      }
      this.send(`${txt}`, true);
      break;
    default:
      this.send('B', false); // Illegal value
      break;
    }
  }

  remote() {
    const [, , param, valueTxt] = this.cmd;
    let value;
    switch (param) {
    case '0': // Open Shutter
      this.d.shutter = true;
      break;
    case '1': // Close Shutter
      this.d.shutter = false;
      break;
    case '2': // Lock front panel
      this.d.frontLockout = true;
      break;
    case '3': // Unlock front panel
      this.d.frontLockout = false;
      break;
    case '4': // Zero thickness
      this.d.thickness = 0;
      break;
    case '5': // Zero timer
      this.d.depositTime = 0;
      break;
    case '6': // Output override on
      this.d.outputOverride = true;
      break;
    case '7': // Output override off
      this.d.outputOverride = false;
      break;
    case '8': // Set output number
    case '9': // Clear output number
      if (typeof valueTxt === 'undefined') { this.send('B', false); return; }
      if (!this.d.outputOverride) { this.send('F', false); return; }
      value = parseInt(valueTxt, 10);
      if (value < 1 || value > 4) { this.send('B', false); return; }
      this.d.outputs[value - 1] = (param === '8');
      break;
    case '10': // Clear power up error messages
      this.d.powerupErrors.paramChecksum = false;
      this.d.powerupErrors.stbyOn = false;
      this.d.powerupErrors.linePower = false;
      this.d.powerupErrors.procDataChecksum = false;
      break;
    case '23': // Set 250 ms data ready IEEE only
      break;
    case '24': // Clear 250 ms data ready IEEE only
      break;
    default:
      this.send('B', false); // Illegal value
      break;
    }
    this.send('', true);
  }

  filmNOK() {
    const film = parseInt(this.cmd[3], 10);
    if (typeof film === 'number' && film >= 1 && film <= 9) return false;
    return true;
  }

  send(msg, success) {
    const terminator = success ? '\x06' : '\x21'; // <ACK> or <NAK>
    console.log(` Res: ${msg}`);
    this.lastMsg = `${msg} ${terminator}`;
    this.port.write(this.lastMsg);
  }
}

const inst = new Inficon('COM6', 9600);
repl.start({
  prompt: 'Inficon> ',
  useGlobal: false,
}).context.inst = inst;
