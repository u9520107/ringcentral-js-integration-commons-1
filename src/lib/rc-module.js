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
  constructor(options = {}) {
    super();
    const {
      promiseForStore,
      getState = defaultGetState,
      prefix,
      actions,
    } = options;
    if (typeof getState !== 'function') {
      throw new Error(
        'The `getState` options property must be of type function'
      );
    }
    this[symbols.getState] = getState;
    if (prefix && typeof prefix !== 'string') {
      throw new Error('The `prefix` options property must be null, undefined, or a string');
    }
    this[symbols.prefix] = prefix;
    this[symbols.actions] = actions && prefixActions(actions, prefix);

    if (!promiseForStore || typeof promiseForStore.then !== 'function') {
      throw new Error(
        'The `promiseForStore` options property must be a promise or promise-like object'
      );
    }
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
      throw new Error('promiseForStore has not been initialized...');
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

/**
 * @function
 * @decorator
 * @param {Object} prototype
 * @param {String} property
 * @param {Object} descriptor
 * @description Decorator function to decorate initialize functions for RcModules
 */
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
    throw new Error('initFunction cannot be called directly');
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

/**
 * @function
 * @description Helper function used to suppress the call of initFunction
 */
export function suppressInit() {
  this[symbols.suppressInit] = true;
}
