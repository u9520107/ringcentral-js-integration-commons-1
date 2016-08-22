import SymbolMap from 'data-types/symbol-map';
import { prefixActions } from './redux-helper';
import Loganberry from 'loganberry';
import Emitter from './emitter';

const logger = new Loganberry({
  prefix: 'rc-module',
});

const symbols = new SymbolMap([
  'store',
  'getState',
  'prefix',
  'actions',
  'emitter',
  'modulePath',
  'oldState',
  'initFunction',
  'suppressInit',
]);

/**
 * @function
 * @param {Object} state
 * @return {Object}
 * @description Default reducer if module does not has its own reducer.
 */
function defaultReducer(state) {
  if (typeof state === 'undefined') return {};
  return state;
}

function defaultGetState() {
  return this.store.getState();
}

/**
 * @class
 * @default
 * @description Base module class.
 */
export default class RcModule extends Emitter {
  /**
   * @constructor
   */
  constructor({
    promiseForStore,
    getState = defaultGetState,
    prefix,
    actions,
  }) {
    super();
    this[symbols.getState] = getState;
    this[symbols.prefix] = prefix;
    this[symbols.actions] = actions && prefixActions(actions, prefix);
    promiseForStore.then((store) => {
      logger.trace('promiseForStore resolved');
      this[symbols.store] = store;

      // state change event for state tracking
      store.subscribe(() => {
        const oldState = this[symbols.oldState];
        const newState = this.state;
        this.emit('state-change', {
          oldState,
          newState,
        });
        this[symbols.oldState] = newState;
      });

      if (!this[symbols.suppressInit] && typeof this[symbols.initFunction] === 'function') {
        this[symbols.initFunction]();
      }
    });
  }

  get state() {
    return this[symbols.getState]();
  }
  get reducer() {
    return defaultReducer;
  }
  get store() {
    if (!this[symbols.store]) {
      logger.error('promiseForStore has not been initialized...');
    }
    return this[symbols.store];
  }
  get prefix() {
    return this[symbols.prefix];
  }
  get actions() {
    return this[symbols.actions];
  }
  get modulePath() {
    return this[symbols.modulePath] || 'root';
  }
}

/**
 * @function addModule
 * @param {String} name - Name of the module. Also used for the property name.
 * @param {any} module - The module to be attached, can be any type.
 * @description Intended to be used as an instance function. Either use
 *  the bind operator (target::addModule('testmodule', {})), or
 *  use call/apply (addModule.call(target, 'testmodule', {})).
 */
export function addModule(name, module) {
  if (this === global || this === RcModule) {
    throw new Error('addModule is intended to be used with scope binding...');
  }
  if (this::Object.prototype.hasOwnProperty(name)) {
    throw new Error(`module '${name}' already exists...`);
  }
  Object.defineProperty(this, name, {
    get() {
      if (!!this[symbols.proxy] && !module instanceof RcModule) {
        throw new Error('Non-RcModule modules are not available in proxied-mode');
      }
      return module;
    },
    enumerable: true,
  });

  // tag submodule with a modulePath for proxying function calls
  // do nothing if module is already tagged
  if (!this[name][symbols.modulePath]) {
    this[name][symbols.modulePath] = `${this.modulePath}.${name}`;
  }
}
RcModule.addModule = addModule;

export function initFunction(prototype, property, descriptor) {
  const {
    value,
  } = descriptor;
  if (typeof value !== 'function') {
    throw new Error('initFunction must be a function');
  }
  const proto = prototype;
  proto[symbols.initFunction] = value;

  function proxyFunction() {
    throw new Error('Init function cannot be called directly');
  }
  proxyFunction.toString = () => value.toString();

  return {
    enumerable: true,
    configurable: false,
    get() {
      return proxyFunction;
    },
  };
}
RcModule.initFunction = initFunction;

export function suppressInit() {
  this[symbols.suppressInit] = true;
}
RcModule.suppressInit = suppressInit;
