import SymbolMap from 'data-types/symbol-map';
import RcModule, { initFunction, suppressInit } from '../../lib/rc-module';
import Loganberry from 'loganberry';
import { combineReducers } from 'redux';
import { ActionMap } from '../../lib/redux-helper';
import uuid from 'uuid';

const logger = new Loganberry({
  prefix: 'rc-proxy',
});

const symbols = new SymbolMap([
  'reducer',
  'module',
  'transport',
  'proxyInitFunction',
  'id',
]);

const proxyActions = new ActionMap([
  'action',
  'execResponse',
  'sync',
], 'proxy');

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
    return this[symbols.transport].exec({
      functionPath,
      args,
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

export function isProxy() {
  return !!this[symbols.transport];
}


export function getProxyServer(Module) {
  return class extends RcModule {
    constructor(options) {
      super(options);
      this[symbols.module] = new Module({
        ...options,
        getState: () => this.state.module,
      });

      const {
        transport,
      } = options;
      if (!transport) {
        throw new Error('getProxyServer require transport to work...');
      }
      transport.on('exec', async (payload) => {
        const {
          functionPath,
          args,
        } = payload;
        // omit the root part of the path
        const [_, ...pathTokens] = functionPath.split('.');
        const fnName = pathTokens.pop();
        let module = this[symbols.module];
        pathTokens.forEach(token => {
          module = module[token];
        });
        try {
          const result = await module[fnName](...args);
          transport.execResponse({
            id: payload.id,
            result,
          });
        } catch (error) {
          transport.execResponse({
            id: payload.id,
            error,
          });
        }
      });

      this[symbols.reducer] = combineReducers({
        module: this[symbols.module].reducer,
        proxy: (state, action) => {
          transport.pipeAction({
            action,
            timestamp: Date.now(),
          });
          return null;
        },
      });
    }
    get reducer() {
      return this[symbols.reducer];
    }
  };
}


function getProxyClientReducer(prefix, moduleReducer) {
  return (state, action) => {
    switch (action.type) {
      default:
        return Object.assign(
          {},
          state,
          {
            module: moduleReducer(
              state && state.module,
              action,
            ),
          }
        );
    }
  };
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

function setTransport(transport) {
  this[symbols.transport] = transport;
  for (const subModule in this) {
    if (this.hasOwnProperty(subModule) && this[subModule] instanceof RcModule) {
      this[subModule]::setTransport(transport);
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
        getState: () => this.state.module,
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

      // kick the module into proxied mode
      if (!options.transport) {
        throw new Error('getProxyClient requires a transport object...');
      }
      this[symbols.module]::setTransport(options.transport);

      options.transport.on('action', async payload => {
        const store = this.store || await options.promiseForStore;
        store.dispatch({
          ...payload,
          type: this.actions.action,
        });
      });

      this[symbols.reducer] = getProxyClientReducer(this.prefix, this[symbols.module].reducer);
    }
    @initFunction
    init() {
      this[symbols.module]::initProxy();
    }
    get reducer() {
      return this[symbols.reducer];
    }
  };
}

