import EventEmitter from 'event-emitter';
import SymbolMap from 'data-types/symbol-map';

const symbols = new SymbolMap([
  'emitter',
]);

export default class Emitter {
  constructor() {
    this[symbols.emitter] = new EventEmitter();
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
}
