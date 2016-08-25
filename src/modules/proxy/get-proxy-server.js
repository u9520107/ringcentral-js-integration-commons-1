import RcModule from '../../lib/rc-module';
import proxyActions from './proxy-actions';
import SymbolMap from 'data-types/symbol-map';
import getProxyServerReducer from './get-proxy-server-reducer';

const symbols = new SymbolMap([
  'module',
  'reducer',
]);

export default function getProxyServer(Module) {
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

      const {
        transport,
      } = options;
      if (!transport) {
        throw new Error('options.transport is missing');
      }
      transport.on(transport.events.request, async request => {
        const {
          requestId,
          payload: {
            type,
            functionPath,
            args,
          },
        } = request;

        if (type === this.actions.execute) {
          // omit the root part of the path
          const [...pathTokens] = functionPath.split('.').slice(1);
          const fnName = pathTokens.pop();
          let module = this[symbols.module];
          pathTokens.forEach(token => {
            module = module[token];
          });
          try {
            const result = await module[fnName](...args);
            transport.response({
              requestId,
              result,
            });
          } catch (error) {
            transport.response({
              requestId,
              error,
            });
          }
        } else if (type === this.actions.sync) {
          transport.response({
            requestId,
            result: this.state,
          });
        } else {
          transport.response({
            requestId,
            error: new Error(`request type '${type} not recognized`),
          });
        }
      });

      this[symbols.reducer] = getProxyServerReducer(
        this.prefix,
        transport,
        this[symbols.module].reducer
      );
    }
    get reducer() {
      return this[symbols.reducer];
    }
  };
}
