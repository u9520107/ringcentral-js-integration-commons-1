import config from '../config';
import RcModule, { addModule } from '../src/lib/rc-module';
import RingCentral from 'ringcentral';
import { combineReducers, createStore } from 'redux';
import Loganberry from 'loganberry';
import { getProxyClient } from '../src/modules/proxy';
import getProxyServer from '../src/modules/proxy/get-proxy-server';
import Auth from '../src/modules/auth';
import Subscription from '../src/modules/subscription';

import EventTransport from '../src/lib/event-transport';


const logger = new Loganberry({
  prefix: 'demo',
});

const REDUCER = Symbol();

const transport = new EventTransport({
  prefix: 'test',
  timeout: 90,
});

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

    this::addModule('subscription', new Subscription({
      ...options,
      auth: this.auth,
      sdk: this.sdk,
      platform: this.sdk.platform(),
      getState: () => this.state.subscription,
    }));

    this[REDUCER] = combineReducers({
      auth: this.auth.reducer,
      subscription: this.subscription.reducer,
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
  transport,
});

serverStoreResolver(createStore(server.reducer));
setTimeout(() => {
  const Client = getProxyClient(Phone);

  let proxyStoreResolver = null;
  const promiseForProxyStore = new Promise(resolve => {
    proxyStoreResolver = resolve;
  });

  const proxy = new Client({
    apiSettings: config.sdk,
    promiseForStore: promiseForProxyStore,
    transport,
  });
  const store = createStore(proxy.reducer);
  store.subscribe(() => {
    logger.trace(JSON.stringify(store.getState(), null, 2));
  });
  proxyStoreResolver(store);

  proxy.auth.isLoggedIn().then(loggedIn => {
    console.log(proxy.auth.loginUrl({
      redirectUri: 'localhost:8080/redirect',
    }));

    proxy.subscription.subscribe(
      '/restapi/v1.0/account/~/extension/~/presence?detailedTelephonyState=true'
    );
    proxy.subscription.on(
      proxy.subscription.eventTypes.notification,
      (message) => {
        logger.info(message);
      }
    );
    if (!loggedIn) {
      proxy.auth.login({
        ...config.user,
      });
    }
  }).catch(e => {
    logger.error(e);
  });

  global.proxy = proxy;
}, 5000);

