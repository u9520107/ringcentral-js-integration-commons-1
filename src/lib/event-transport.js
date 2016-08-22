import SymbolMap from 'data-types/symbol-map';
import uuid from 'uuid';
import Emitter from './emitter';

const symbols = new SymbolMap([
  'handler',
  'id',
  'events',
  'deferred',
  'timeout',
]);

export default class EventTransport extends Emitter {
  constructor({ prefix, timeout = 30 }) {
    super();
    this[symbols.handlers] = new Set();
    this[symbols.id] = uuid.v4();
    const prefixString = prefix ? `${prefix}-` : '';
    this[symbols.events] = {
      request: `${prefixString}-event-transport-request`,
      response: `${prefixString}-event-transport-response`,
      push: `${prefixString}-event-tranport-push`,
    };
    this[symbols.deferred] = new Map();
    this[symbols.timeout] = Math.max(timeout * 1000, 5000);
  }
  get events() {
    return this[symbols.events];
  }
  async request({ payload }) {
    const requestId = uuid.v4();
    const promise = new Promise((resolve, reject) => {
      this[symbols.deferred].set(requestId, {
        resolve,
        reject,
      });
    });
    let timeout = setTimeout(() => {
      timeout = null;
      this[symbols.deferred].get(requestId).reject(new Error('Response timeout'));
    }, this[symbols.timeout]);
    promise.then(result => {
      if (timeout) clearTimeout(timeout);
      this[symbols.deferred].delete(requestId);
      return Promise.resolve(result);
    }).catch(error => {
      if (timeout) clearTimeout(timeout);
      this[symbols.deferred].delete(requestId);
      return Promise.reject(error);
    });

    this.emit(this[symbols.events].request, {
      requestId,
      payload,
    });
    return promise;
  }
  response({ requestId, result, error }) {
    const deferred = this[symbols.deferred].get(requestId);
    if (deferred) {
      if (error) {
        deferred.reject(error);
      } else {
        deferred.resolve(result);
      }
    }
  }
  push({ payload }) {
    this.emit(this[symbols.events].push, payload);
  }
}
