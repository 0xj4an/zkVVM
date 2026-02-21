// Pino stub for browser - @evvm/evvm-js uses pino but we don't need logging in browser
const noop = () => {};
const noopLogger = {
  trace: noop,
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
  fatal: noop,
  child: () => noopLogger,
  level: 'silent',
  levelVal: 0,
  silent: noop,
};

// Pino log levels
export const levels = {
  values: {
    fatal: 60,
    error: 50,
    warn: 40,
    info: 30,
    debug: 20,
    trace: 10,
  },
  labels: {
    10: 'trace',
    20: 'debug',
    30: 'info',
    40: 'warn',
    50: 'error',
    60: 'fatal',
  },
};

export function pino() {
  return noopLogger;
}

// Additional exports that pino provides
export const symbols = {
  setLevelSym: Symbol('pino.setLevel'),
  getLevelSym: Symbol('pino.getLevel'),
  levelValSym: Symbol('pino.levelVal'),
  useLevelLabelsSym: Symbol('pino.useLevelLabels'),
  mixinSym: Symbol('pino.mixin'),
  lsCacheSym: Symbol('pino.lsCache'),
  chindingsSym: Symbol('pino.chindings'),
  parsedChindingsSym: Symbol('pino.parsedChindings'),
  asJsonSym: Symbol('pino.asJson'),
  writeSym: Symbol('pino.write'),
  redactFmtSym: Symbol('pino.redactFmt'),
  timeSym: Symbol('pino.time'),
  timeSliceIndexSym: Symbol('pino.timeSliceIndex'),
  streamSym: Symbol('pino.stream'),
  stringifySym: Symbol('pino.stringify'),
  stringifiersSym: Symbol('pino.stringifiers'),
  endSym: Symbol('pino.end'),
  formatOptsSym: Symbol('pino.formatOpts'),
  messageKeySym: Symbol('pino.messageKey'),
  nestedKeySym: Symbol('pino.nestedKey'),
  wildcardFirstSym: Symbol('pino.wildcardFirst'),
  needsMetadataGsym: Symbol('pino.needsMetadataGsym'),
  useOnlyCustomLevelsSym: Symbol('pino.useOnlyCustomLevels'),
  formattersSym: Symbol('pino.formatters'),
  hooksSym: Symbol('pino.hooks'),
};

export const destination = () => ({ write: noop });
export const stdSerializers = {
  req: (req) => req,
  res: (res) => res,
  err: (err) => err,
};
export const stdTimeFunctions = {};
export const multistream = () => ({ write: noop });

export default pino;
