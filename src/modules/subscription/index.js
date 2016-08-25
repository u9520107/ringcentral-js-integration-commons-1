import RcModule, { initFunction } from '../../lib/rc-module';
import SymbolMap from 'data-types/symbol-map';
import subscriptionActions from './subscription-actions';
import getSubscriptionReducer from './subscription-reducer';
import { subscriptionEvents, subscriptionEventTypes } from './subscription-events';
import subscriptionStatus from './subscription-status';
import { emit } from '../../lib/utils';
import { proxify } from '../proxy';

const symbols = new SymbolMap([
  'auth',
  'sdk',
  'platform',
  'subscription',
]);

/**
 * @function
 * @param {Object} message
 * @description Handles messages delivered by the subscripton
 */
function messageHandler(message) {
  // dispatch the message in redux manner
  this.store.dispatch({
    type: this.actions.notification,
    message,
  });
}
async function init() {
  if (this.base) {
    await this.reset();
  }
  const platform = this[symbols.platform];
  this[symbols.subscription] = this[symbols.sdk].createSubscription();
  const ownerId = platform.auth().data().owner_id;
  let cacheKey = null;
  if (typeof localStorage !== 'undefined') {
    cacheKey = `${this.prefix}-sub-${ownerId}`;
    const cachedSubscription = localStorage.getItem(cacheKey);
    if (cachedSubscription) {
      try {
        this.base.setSubscription(JSON.parse(cachedSubscription));
      } catch (e) {
        /* do nothing */
      }
    }
  }
  this.base.setEventFilters(this.filters);
  this.base.on(this.base.events.notification, message => {
    this::messageHandler(message);
  });
  this.base.on(this.base.events.removeSuccess, () => {
    this.store.dispatch({
      type: this.actions.updateStatus,
      status: subscriptionStatus.notSubscribed,
      subscription: null,
    });
    // this::emit(subscriptionEventTypes.statusChanged, this.status);
  });
  this.base.on(this.base.events.removeError, () => {
    // TODO
  });
  this.base.on(this.base.events.renewSuccess, () => {
    if (cacheKey) {
      localStorage.setItem(cacheKey, JSON.stringify(this.base.subscription()));
    }
    // const oldStatus = this.status;
    this.store.dispatch({
      type: this.actions.updateStatus,
      status: subscriptionStatus.subscribed,
      subscription: this.base.subscription(),
    });
  });
  this.base.on(this.base.events.renewError, error => {
    // TODO handle 429
    this.store.dispatch({
      type: this.actions.updateStatus,
      status: subscriptionStatus.notSubscribed,
      subscription: null,
    });
    this.base.reset().setEventFilters(this.filters).register().catch(e => { });
  });
  this.base.on(this.base.events.subscribeSuccess, () => {
    if (cacheKey) {
      localStorage.setItem(cacheKey, JSON.stringify(this.base.subscription()));
    }
    this.store.dispatch({
      type: this.actions.updateStatus,
      status: subscriptionStatus.subscribed,
      subscription: this.base.subscription(),
    });
  });
  this.base.on(this.base.events.subscribeError, error => {
    // TODO
    // handle 429
    // handle subscription limit
  });

  if (this.filters.length) {
    await this.base.register().catch(() => { /* do nothing */ });
  }
}

export default class Subscription extends RcModule {
  constructor(options) {
    super({
      ...options,
      actions: subscriptionActions,
    });

    const {
      auth,
      platform,
      sdk,
    } = options;
    this[symbols.auth] = auth;
    this[symbols.platform] = platform;
    this[symbols.sdk] = sdk;
    this[symbols.subscription] = null;

    // send events based on state change
    this.on('state-change', ({ oldState, newState }) => {
      if (!oldState || oldState.status !== newState.status) {
        this::emit(this.eventTypes.statusChanged, newState.status);
      }
      if (newState.lastMessage && (!oldState || newState.lastMessag !== oldState.lastMessage)) {
        this.emit(this.eventTypes.notification, newState.lastMessage);
      }
    });
  }
  @initFunction
  init() {
    const auth = this[symbols.auth];
    auth.on(auth.events.loggedIn, () => {
      this::init();
    });

    auth.on(auth.events.loggedOut, () => {
      if (this.base) {
        this.reset();
      }
    });

    auth.addBeforeLogoutHandler(async () => {
      await this.reset();
    });
  }

  get reducer() {
    return getSubscriptionReducer(this.prefix);
  }

  get status() {
    return this.state.status;
  }

  get filters() {
    return this.state.filters;
  }

  get base() {
    return this[symbols.subscription];
  }

  get events() {
    return subscriptionEvents;
  }

  get eventTypes() {
    return subscriptionEventTypes;
  }

  @proxify
  async subscribe(event) {
    if (this.filters.indexOf(event) === -1) {
      const newFilters = this.filters.slice();
      newFilters.push(event);
      this.store.dispatch({
        type: this.actions.updateFilters,
        filters: newFilters,
      });
      if (this.base) {
        this.base.setEventFilters(newFilters);
        await this.base.register().catch(() => { /* do nothing */ });
      }
    }
  }

  @proxify
  async unsubscribe(event) {
    const idx = this.filters.indexOf(event);
    if (this.filters.indexOf(event) > -1) {
      const newFilters = this.filters.slice();
      newFilters.splice(idx, 1);
      this.store.dispatch({
        type: this.actions.updateFilters,
        filters: newFilters,
      });
      if (this.base) {
        this.base.setEventFilters(newFilters);
        if (newFilters.length) {
          this.base.register().catch(() => { /* do nothing */ });
        } else {
          this.base.remove();
        }
      }
    }
  }

  @proxify
  async reset() {
    try {
      if (this.base) {
        if (this.status === subscriptionStatus.subscribed) {
          await this.base.remove();
        } else {
          await this.base.reset();
        }
      }
    } catch (e) {
      // TODO
    }
    this[symbols.subscription] = null;
    this.store.dispatch({
      type: this.actions.updateStatus,
      status: subscriptionStatus.notSubscribed,
      subscription: null,
    });
  }
}
