import SymbolMap from 'data-types/symbol-map';
import { prefixActions } from './redux-helper';
import EventEmitter from 'event-emitter';

const symbols = new SymbolMap([
  'store',
  'getState',
  'prefix',
  'actions',
  'emitter',
  'subModule',
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
export default class RcModule {
  /**
   * @constructor
   */
  constructor({
    promiseForStore,
    getState = defaultGetState,
    prefix,
    actions,
  }) {
    // Extending EventEmitter breaks some mechanic, so we wire emitter up like this instead.
    this[symbols.emitter] = new EventEmitter();
    this[symbols.getState] = getState;
    this[symbols.prefix] = prefix;
    this[symbols.actions] = actions && prefixActions(actions, prefix);
    promiseForStore.then((store) => {
      this[symbols.store] = store;
    });
  }

  /**
   * @function
   * @param {String} event
   * @param {Function} handler
   * @return {Function} Unregister function.
   */
  on(event, handler) {
    this[symbols.emitter].on(event, handler);
    return () => {
      this[symbols.emitter].off(event, handler);
    };
  }
  /**
   * @function
   * @param {String} event
   * @param {Function)} handler
   * @return {Function} Unregister function.
   */
  once(event, handler) {
    this[symbols.emitter].once(event, handler);
    return () => {
      this[symbols.emitter].off(event, handler);
    };
  }
  /**
   * @function
   * @param {String} event
   * @param {...args} args
   */
  emit(event, ...args) {
    this[symbols.emitter].emit(event, ...args);
  }
  /**
   * @function
   * @param {String} event
   * @param {Function} handler
   */
  off(event, handler) {
    this[symbols.emitter].off(event, handler);
  }

  get state() {
    return this[symbols.getState]();
  }
  get reducer() {
    return defaultReducer;
  }
  get store() {
    return this[symbols.store];
  }
  get prefix() {
    return this[symbols.prefix];
  }
  get actions() {
    return this[symbols.actions];
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
      return module;
    },
    enumerable: true,
  });
}
RcModule.addModule = addModule;
