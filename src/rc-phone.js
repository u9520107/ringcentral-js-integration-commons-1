import RingCentral from 'ringcentral';
import RingCentralClient from 'ringcentral-client';

import RcModule, { addModule } from './lib/rc-module';

import Settings from './modules/settings';
import Brand from './modules/brand';
import Auth from './modules/auth';
import Subscription from './modules/subscription';
import User from './modules/user';
import Webphone from './modules/webphone';
import Contact from './modules/contact';
import { combineReducers } from 'redux';

const REDUCER = Symbol();


export default class RcPhone extends RcModule {
  constructor(options) {
    const {
      getState,
      prefix = 'rc',
      sdkSettings,
      defaultBrand,
    } = options;
    super({
      getState,
    });
    this::addModule('sdk', new RingCentral({

      cachePrefix: `${prefix}-`,
      ...sdkSettings,
    }));

    this::addModule('platform', this.sdk.platform());

    this::addModule('api', new RingCentralClient(this.sdk));

    this::addModule('auth', new Auth({
      getState: () => this.state.auth,
      prefix,
      platform: this.platform,
    }));

    this::addModule('settings', new Settings({
      getState: () => this.state.settings,
    }));

    this::addModule('defaultBrand', new Brand({
      prefix: `${prefix}-default`,
      getState: () => this.state.defaultBrand,
      ...defaultBrand,
    }));

    this::addModule('subscription', new Subscription({
      getState: () => this.state.subscription,
      prefix,
      api: this.api,
      platform: this.platform,
      sdk: this.sdk,
      auth: this.auth,
    }));

    this::addModule('user', new User({
      getState: () => this.state.user,
      prefix,
      api: this.api,
      platform: this.platform,
      settings: this.settings,
    }));

    this::addModule('webphone', new Webphone({
      getState: () => this.state.webphone,
      prefix,
      api: this.api,
      platform: this.platform,
      settings: this.settings,
      auth: this.auth,
    }));

    // this::addModule('contact', new Contact({
    //   getState: () => this.state.contact,
    //   prefix,
    //   api: this.api,
    //   platform: this.platform,
    //   settings: this.settings,
    // }));

    // combine reducers
    this[REDUCER] = combineReducers({
      auth: this.auth.reducer,
      defaultBrand: this.defaultBrand.reducer,
      subscription: this.subscription.reducer,
      user: this.user.reducer,
      webphone: this.webphone.reducer,
      // contact: this.contact.reducer,
      settings: this.settings.reducer,
    });
  }
  get reducer() {
    return this[REDUCER];
  }
}
