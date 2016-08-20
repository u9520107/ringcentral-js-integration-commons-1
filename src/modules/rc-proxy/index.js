import SymbolMap from 'data-types/symbol-map';
import RcModule from '../../lib/rc-module';
import Loganberry from 'loganberry';
import { combineReducers } from 'redux';

const logger = new Loganberry({
  prefix: 'rc-proxy',
});

const symbols = new SymbolMap([
  'reducer',
  'module',
  'transport',
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

function setTransport(transport) {
  this[symbols.transport] = transport;
  for (const subModule in this) {
    if (this.hasOwnProperty(subModule) && this[subModule] instanceof RcModule) {
      this[subModule]::setTransport(transport);
    }
  }
}

export function getProxyClient(Module) {
  return class extends RcModule {
    constructor(options) {
      super(options);
      this[symbols.module] = new Module({
        ...options,
        getState: () => this.state.module,
      });

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
      options.transport.on('action', action => {
        this.store.dispatch(action);
      });
      this[symbols.reducer] = getProxyClientReducer(this.prefix, this[symbols.module].reducer);
    }
    get reducer() {
      return this[symbols.reducer];
    }
  };
}


