import RcModule, { addModule } from '../src/lib/rc-module';
import Auth from '../src/modules/auth';
import RingCentral from 'ringcentral';
import config from '../config';
import { combineReducers, createStore } from 'redux';
import Loganberry from 'loganberry';
import { getProxyServer, getProxyClient } from '../src/modules/rc-proxy';
import uuid from 'uuid';

import EventEmitter from 'event-emitter';
import Emitter from '../src/lib/emitter';

const logger = new Loganberry({
  prefix: 'demo',
});

const REDUCER = Symbol();

// the receiving emitter on client side
const clientEmitter = new EventEmitter();

// the receiving emitter on server side
const serverEmitter = new EventEmitter();


class EventTransport extends Emitter {
  constructor(sourceEmitter, targetEmitter) {
    super();
    this.deferred = new Map();
    sourceEmitter.on('message', (data) => {
      try {
        const payload = JSON.parse(data);
        let deferred = null;
        switch (payload.type) {
          case 'rc-proxy-exec':
            this.emit('exec', payload);
            break;
          case 'rc-proxy-exec-response':
            deferred = this.deferred.get(payload.id);
            if (!deferred) return;
            if (payload.error) {
              deferred.reject(payload.error);
            } else {
              deferred.resolve(payload.result);
            }
            break;
          case 'rc-proxy-pipe-action':
            this.emit('action', payload.action);
            break;
          default:
            break;
        }
      } catch (e) {
        logger.error(e);
      }
    });
    this.targetEmitter = targetEmitter;
    this.sourceEmitter = sourceEmitter;
  }
  exec(params) {
    const payload = {
      ...params,
      type: 'rc-proxy-exec',
      id: uuid.v4(),
    };
    logger.info(params);
    const promise = new Promise((resolve, reject) => {
      this.deferred.set(payload.id, {
        resolve,
        reject,
      });
    });

    let timeout = setTimeout(() => {
      timeout = null;
      this.deferred.get(payload.id).reject(new Error('Proxied Execution Timeout'));
    }, 30000);

    promise.then((...args) => {
      if (timeout) clearTimeout(timeout);
      this.deferred.delete(payload.id);
      return Promise.resolve(...args);
    }, (...args) => {
      if (timeout) clearTimeout(timeout);
      this.deferred.delete(payload.id);
      return Promise.reject(...args);
    });

    this.targetEmitter.emit('message', JSON.stringify(payload));
    return promise;
  }
  execResponse(params) {
    this.targetEmitter.emit('message', JSON.stringify({
      ...params,
      type: 'rc-proxy-exec-response',
    }));
  }
  pipeAction(params) {
    this.targetEmitter.emit('message', JSON.stringify({
      ...params,
      type: 'rc-proxy-pipe-action',
      id: uuid.v4(),
    }));
  }
  async sync(params) {

  }
}



class Phone extends RcModule {
  constructor(options) {
    super(options);
    const {
      apiSettings,
    } = options;
    this::addModule('sdk', new RingCentral(apiSettings));
    this::addModule('auth', new Auth({
      ...options,
      platform: this.sdk.platform(),
      getState: () => this.state.auth,
    }));

    this[REDUCER] = combineReducers({
      auth: this.auth.reducer,
    });
  }
  get reducer() {
    return this[REDUCER];
  }
}

const Server = getProxyServer(Phone);

let serverStoreResolver = null;
const promiseForServerStore = new Promise(resolve => {
  serverStoreResolver = resolve;
});

const server = new Server({
  apiSettings: config.sdk,
  promiseForStore: promiseForServerStore,
  transport: new EventTransport(serverEmitter, clientEmitter),
});

serverStoreResolver(createStore(server.reducer));




const Client = getProxyClient(Phone);

let proxyStoreResolver = null;
const promiseForProxyStore = new Promise(resolve => {
  proxyStoreResolver = resolve;
});

const proxy = new Client({
  apiSettings: config.sdk,
  promiseForStore: promiseForProxyStore,
  transport: new EventTransport(clientEmitter, serverEmitter),
});

proxyStoreResolver(createStore(proxy.reducer));

proxy.auth.isLoggedIn().then(() => {
  console.log(proxy.auth.loginUrl({
    redirectUri: 'localhost:8080/redirect',
  }));
  proxy.auth.login({
    ...config.user,
  });
  proxy.auth.on(proxy.auth.events.loggedIn, () => {
    console.log('loggedIn');
  });


}).catch(e => {
  logger.error(e);
});
