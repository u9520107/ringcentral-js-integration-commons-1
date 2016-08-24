import SymbolMap from 'data-types/symbol-map';
import RcModule, { initFunction, suppressInit } from '../../lib/rc-module';
import Loganberry from 'loganberry';
import uuid from 'uuid';

import proxyActions from './proxy-actions';
import getProxyClientReducer from './get-proxy-client-reducer';

const logger = new Loganberry({
  prefix: 'proxy',
});

const symbols = new SymbolMap([
  'reducer',
  'module',
  'transport',
  'proxyInitFunction',
  'id',
  'syncPromise',
  'proxyActions',
]);

export function proxify(prototype, property, descriptor) {
  logger.trace(['proxify', {
    prototype,
    property,
    descriptor,
  }]);
  const {
    configurable,
    enumerable,
    value,
  } = descriptor;

  function proxyFn(...args) {
    const functionPath = `${this.modulePath}.${property}`;
    logger.trace(`${functionPath} proxied`);
    return this[symbols.transport].request({
      payload: {
        type: this[symbols.proxyActions].execute,
        functionPath,
        args,
      },
    }).catch(error => {
      const newError = new Error('Proxy execution timed out...');
      newError.originalError = error;
      return Promise.reject(newError);
    });
  }
  return {
    configurable,
    enumerable,
    get() {
      if (!this[symbols.transport]) {
        return value;
      }
      return proxyFn;
    },
  };
}

export function throwOnProxy(prototype, property, descriptor) {
  logger.trace(['throwOnProxy', {
    prototype,
    property,
    descriptor,
  }]);
  const {
    configurable,
    enumerable,
    value,
  } = descriptor;
  function proxyFunction() {
    throw new Error(`function '${this.modulePath}.${property}' cannot be called on proxy instance`);
  }
  return {
    configurable,
    enumerable,
    get() {
      if (!this[symbols.transport]) {
        return value;
      }
      return proxyFunction;
    },
  };
}


function sync() {
  if (!this[symbols.syncPromise]) {
    this[symbols.syncPromise] = (async () => {
      const result = await this[symbols.transport].request({
        payload: {
          type: this.actions.sync,
        },
      });
      this.store.dispatch({
        ...result,
        type: this.actions.sync,
      });
      this[symbols.syncPromise] = null;
    })();
  }
}

export function proxyInitFunction(prototype, property, descriptor) {
  const {
    value,
  } = descriptor;
  if (typeof value !== 'function') {
    throw new Error('proxyInitFunction must be a function');
  }
  const proto = prototype;
  proto[symbols.proxyInitFunction] = value;

  function proxyFunction() {
    throw new Error('proxyInit function cannot be called directly');
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

function initProxy() {
  if (typeof this[symbols.proxyInitFunction] === 'function') {
    this[symbols.proxyInitFunction]();
  }
  for (const subModule in this) {
    if (this.hasOwnProperty(subModule) && this[subModule] instanceof RcModule) {
      this[subModule]::initProxy();
    }
  }
}

function setTransport(transport, actions) {
  this[symbols.transport] = transport;
  this[symbols.proxyActions] = actions;
  for (const subModule in this) {
    if (this.hasOwnProperty(subModule) && this[subModule] instanceof RcModule) {
      this[subModule]::setTransport(transport, actions);
      this[subModule]::suppressInit();
    }
  }
}

export function getProxyClient(Module) {
  return class extends RcModule {
    constructor(options) {
      super({
        ...options,
        actions: proxyActions,
      });
      this[symbols.module] = new Module({
        ...options,
        getState: () => this.state,
      });
      this[symbols.id] = uuid.v4();

      for (const subModule in this[symbols.module]) {
        if (
          this[symbols.module].hasOwnProperty(subModule) &&
          this[symbols.module][subModule] instanceof RcModule
        ) {
          Object.defineProperty(this, subModule, {
            configurable: false,
            enumerable: true,
            get() {
              return this[symbols.module][subModule];
            },
          });
        }
      }
      const {
        transport,
      } = options;
      // kick the module into proxied mode
      if (!transport) {
        throw new Error('getProxyClient requires a transport object...');
      }
      this[symbols.transport] = transport;
      this[symbols.module]::setTransport(transport, this.actions);

      this[symbols.reducer] = getProxyClientReducer(this.prefix, this[symbols.module].reducer);
    }
    @initFunction
    init() {
      const transport = this[symbols.transport];
      this[symbols.module]::initProxy();
      transport.on(transport.events.push, async payload => {  // register push after init
        if (payload.type === this.actions.action) {
          logger.trace(payload);
          if (this[symbols.syncPromise]) await this[symbols.syncPromise];
          this.store.dispatch({
            ...payload,
            type: this.actions.action,
          });
        }
      });
      this::sync();
    }
    get reducer() {
      return this[symbols.reducer];
    }
    get state() {
      return this.store.getState().module;
    }
    get proxyState() {
      return this.store.getState();
    }
  };
}

