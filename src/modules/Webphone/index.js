import RingCentralWebphone from 'ringcentral-web-phone';
import incomingAudio from 'ringcentral-web-phone/audio/incoming.ogg';
import outgoingAudio from 'ringcentral-web-phone/audio/outgoing.ogg';

import RcModule from '../../lib/RcModule';
import sleep from '../../lib/sleep';
import moduleStatus from '../../enums/moduleStatus';
import connectionStatus from './connectionStatus';
import sessionStatus from './sessionStatus';
import actionTypes from './actionTypes';
import callDirections from '../../enums/callDirections';
import webphoneErrors from './webphoneErrors';

import {
  isBrowerSupport,
  patchUserAgent,
  patchIncomingSession,
} from './webphoneHelper';
import getWebphoneReducer, { getWebphoneCountsReducer } from './getWebphoneReducer';

const FIRST_THREE_RETRIES_DELAY = 10 * 1000;
const FOURTH_RETRIES_DELAY = 30 * 1000;
const FIFTH_RETRIES_DELAY = 60 * 1000;
const MAX_RETRIES_DELAY = 2 * 60 * 1000;

export default class Webphone extends RcModule {
  constructor({
    appKey,
    appName,
    appVersion,
    alert,
    auth,
    client,
    rolesAndPermissions,
    webphoneLogLevel = 3,
    storage,
    ...options,
  }) {
    super({
      ...options,
      actionTypes,
    });
    this._appKey = appKey;
    this._appName = appName;
    this._appVersion = appVersion;
    this._alert = alert;
    this._webphoneLogLevel = webphoneLogLevel;
    this._auth = auth;
    this._client = client;
    this._rolesAndPermissions = rolesAndPermissions;
    this._storage = storage;
    this._storageWebphoneCountsKey = 'webphoneCounts';
    this._webphone = null;
    this._remoteVideo = null;
    this._localVideo = null;

    this._activeSession = null;
    this._sessions = new Map();

    this._reducer = getWebphoneReducer(this.actionTypes);

    storage.registerReducer({
      key: this._storageWebphoneCountsKey,
      reducer: getWebphoneCountsReducer(this.actionTypes),
    });

    this.toggleMinimized = this.toggleMinimized.bind(this);
    this.answer = this.answer.bind(this);
    this.reject = this.reject.bind(this);
    this.resume = this.resume.bind(this);
    this.hangup = this.hangup.bind(this);
  }

  initialize() {
    if (
      typeof window !== 'undefined' &&
      typeof document !== 'undefined'
    ) {
      this._remoteVideo = document.createElement('video');
      this._remoteVideo.setAttribute('hidden', 'hidden');
      this._localVideo = document.createElement('video');
      this._localVideo.setAttribute('hidden', 'hidden');
      this._localVideo.setAttribute('muted', 'muted');
      document.body.appendChild(this._remoteVideo);
      document.body.appendChild(this._localVideo);
      window.unload = () => {
        this.disconnect();
      };
      this.store.dispatch({
        type: this.actionTypes.init,
        videoElementPrepared: true,
      });
    } else {
      this.store.dispatch({
        type: this.actionTypes.init,
        videoElementPrepared: false,
      });
    }
    this.store.subscribe(() => this._onStateChange());
  }

  _onStateChange() {
    if (this._shouldInit()) {
      this.store.dispatch({
        type: this.actionTypes.initSuccess,
      });
    } else if (this._shouldReset()) {
      this.store.dispatch({
        type: this.actionTypes.resetSuccess,
      });
      this.disconnect();
    }
  }

  _shouldInit() {
    return (
      this._auth.loggedIn &&
      this._rolesAndPermissions.ready &&
      !this.ready
    );
  }

  _shouldReset() {
    return (
      (
        !this._auth.loggedIn ||
        !this._rolesAndPermissions.ready
      ) &&
      this.ready
    );
  }

  async _sipProvision() {
    const response = await this._client.service.platform()
      .post('/client-info/sip-provision', {
        sipInfo: [{ transport: 'WSS' }]
      });
    return response.json();
  }

  _createWebphone(provisionData) {
    this._webphone = new RingCentralWebphone(provisionData, {
      appKey: this._appKey,
      appName: this._appName,
      appVersion: this._appVersion,
      uuid: this._auth.endpoingId,
      logLevel: this._webphoneLogLevel, // error 0, warn 1, log: 2, debug: 3
      audioHelper: {
        enabled: true, // enables audio feedback when web phone is ringing or making a call
        incoming: incomingAudio, // path to audio file for incoming call
        outgoing: outgoingAudio, // path to aduotfile for outgoing call
      }
    });

    const onRegistered = () => {
      this.store.dispatch({
        type: this.actionTypes.registered,
      });
    };
    const onUnregistered = () => {
      this.store.dispatch({
        type: this.actionTypes.unregistered,
      });
      this._webphone.userAgent.removeAllListeners();
      this._webphone = null;
    };
    const onRegistrationFailed = (error) => {
      this.store.dispatch({
        type: this.actionTypes.registrationFailed,
        error,
      });
      this._webphone.userAgent.removeAllListeners();
      this._webphone = null;
      if (error && error.reason_phrase && error.reason_phrase.indexOf('Too Many Contacts') > -1) {
        this._alert.warning({
          message: webphoneErrors.webphoneCountOverLimit,
        });
        return;
      }
      this._connect(true);
    };
    this._webphone.userAgent.audioHelper.setVolume(0.3);
    this._webphone.userAgent.on('registered', onRegistered);
    this._webphone.userAgent.on('unregistered', onUnregistered);
    this._webphone.userAgent.once('registrationFailed', onRegistrationFailed);
    this._webphone.userAgent.on('invite', (session) => {
      console.log('UA invite');
      this._onInvite(session);
    });
    patchUserAgent(this._webphone.userAgent);
  }

  async _connect(reconnect = false) {
    try {
      if (reconnect) {
        await this._retrySleep();
      }

      // do not connect if it is connecting
      if (this.connectionStatus === connectionStatus.connecting) {
        return;
      }

      // when reconnect is break by disconnect
      if (reconnect && this.connectionStatus !== connectionStatus.connectFailed) {
        this.store.dispatch({
          type: this.actionTypes.resetRetryCounts,
        });
        return;
      }

      this.store.dispatch({
        type: (
          reconnect ?
            this.actionTypes.reconnect : this.actionTypes.connect
        )
      });

      const sipProvision = await this._sipProvision();

      // do not continue if it is disconnecting
      if (this.connectionStatus === connectionStatus.disconnecting) {
        return;
      }
      this._createWebphone(sipProvision);
    } catch (error) {
      this.store.dispatch({
        type: this.actionTypes.connectError,
        error,
      });
      this._alert.warning({
        message: webphoneErrors.connectFailed,
        ttl: 0,
        allowDuplicates: false,
      });
      if (
        error && error.message &&
        (error.message.indexOf('Feature [WebPhone] is not available') > -1)
      ) {
        this._rolesAndPermissions.refreshServiceFeatures();
        return;
      }
      await this._connect(true);
    }
  }

  async connect(hasFromNumber) {
    if (
      (await this._auth.checkIsLoggedIn()) &&
      this.enabled &&
      this.connectionStatus === connectionStatus.disconnected
    ) {
      if (!isBrowerSupport()) {
        this._alert.warning({
          message: webphoneErrors.browserNotSupported,
          ttl: 0,
        });
        return;
      }
      if (!hasFromNumber) {
        this._alert.warning({
          message: webphoneErrors.notOutboundCallWithoutDL,
        });
        return;
      }
      await this._connect();
    }
  }

  disconnect() {
    if (
      this.connectionStatus === connectionStatus.connected ||
      this.connectionStatus === connectionStatus.connecting ||
      this.connectionStatus === connectionStatus.connectFailed
    ) {
      this.store.dispatch({
        type: this.actionTypes.disconnect,
      });
      if (this._webphone) {
        this._webphone.userAgent.stop();
        this._webphone.userAgent.unregister();
        this._sessions.forEach((session) => {
          this.hangup(session);
        });
      }
    }
  }

  _onAccepted(session) {
    session.on('accepted', () => {
      console.log('accepted');
      session.callStatus = sessionStatus.connected;
      this._updateCurrentSessionAndSessions(session);
    });
    session.on('progress', () => {
      console.log('progress...');
      session.callStatus = sessionStatus.connecting;
      this._updateCurrentSessionAndSessions(session);
    });
    session.on('rejected', () => {
      console.log('rejected');
      session.callStatus = sessionStatus.finished;
      this._removeSession(session);
    });
    session.on('failed', (response, cause) => {
      console.log('Event: Failed');
      console.log(cause);
      session.callStatus = sessionStatus.finished;
      this._removeSession(session);
    });
    session.on('terminated', () => {
      console.log('Event: Terminated');
      session.callStatus = sessionStatus.finished;
      this._removeSession(session);
    });
    session.on('cancel', () => {
      console.log('Event: Cancel');
      session.callStatus = sessionStatus.finished;
      this._removeSession(session);
    });
    session.on('refer', () => {
      console.log('Event: Refer');
    });
    session.on('replaced', (newSession) => {
      session.callStatus = sessionStatus.replaced;
      newSession.callStatus = sessionStatus.connected;
      newSession.direction = callDirections.inbound;
      this._addSession(newSession);
      this.onAccepted(newSession);
    });
    session.on('muted', () => {
      console.log('Event: Muted');
      session.isOnMute = true;
      session.callStatus = sessionStatus.onMute;
    });
    session.on('unmuted', () => {
      console.log('Event: Unmuted');
      session.isOnMute = false;
      session.callStatus = sessionStatus.connected;
    });
    session.on('hold', () => {
      console.log('Event: hold');
      session.callStatus = sessionStatus.onHold;
    });
    session.on('unhold', () => {
      console.log('Event: unhold');
      session.callStatus = sessionStatus.connected;
    });
  }

  _onInvite(session) {
    session.creationTime = Date.now();
    session.direction = callDirections.inbound;
    session.callStatus = sessionStatus.connecting;
    if (!this._activeSession) {
      this._activeSession = session;
      this.store.dispatch({
        type: this.actionTypes.updateCurrentSession,
        session,
      });
    }
    patchIncomingSession(session);
    this._addSession(session);
    session.on('rejected', () => {
      console.log('Event: Rejected');
      this._removeSession(session);
    });
  }

  async answer(sessionId) {
    const session = this._sessions.get(sessionId);
    if (!session) {
      return;
    }
    try {
      if (
        this._activeSession && !this._activeSession.isOnHold().local &&
        this._activeSession !== session
      ) {
        this._activeSession.hold();
      }
      this._setActiveSession(session);
      this._onAccepted(session, 'inbound');
      await session.accept(this.acceptOptions);
      this._resetMinimized();
    } catch (e) {
      console.log('Accept failed');
      this._removeSession(session);
      this._removeActiveSession();
    }
  }

  reject(sessionId) {
    this._sessionHandleWithId(sessionId, (session) => {
      session.reject();
    });
  }

  resume(sessionId) {
    this.unhold(sessionId);
    this._resetMinimized();
  }

  async forward(forwardNumber, sessionId) {
    const session = this._sessions.get(sessionId);
    if (!session) {
      return;
    }
    try {
      await session.forward(forwardNumber, this.acceptOptions);
      console.log('Forwarded');
    } catch (e) {
      console.error(e);
    }
  }

  increaseVolume(sessionId) {
    this._sessionHandleWithId(sessionId, (session) => {
      session.ua.audioHelper.setVolume(
        (session.ua.audioHelper.volume != null ? session.ua.audioHelper.volume : 0.5) + 0.1
      );
    });
  }

  decreaseVolume(sessionId) {
    this._sessionHandleWithId(sessionId, (session) => {
      session.ua.audioHelper.setVolume(
        (session.ua.audioHelper.volume != null ? session.ua.audioHelper.volume : 0.5) - 0.1
      );
    });
  }

  mute(sessionId) {
    this._sessionHandleWithId(sessionId, (session) => {
      session.isOnMute = true;
      session.mute();
      this._updateCurrentSessionAndSessions(session);
    });
  }

  unmute(sessionId) {
    this._sessionHandleWithId(sessionId, (session) => {
      session.isOnMute = false;
      session.unmute();
      this._updateCurrentSessionAndSessions(session);
    });
  }

  hold(sessionId) {
    this._sessionHandleWithId(sessionId, (session) => {
      session.hold();
      this._updateCurrentSessionAndSessions(session);
    });
  }

  unhold(sessionId) {
    const session = this._sessions.get(sessionId);
    if (!session) {
      return;
    }
    if (session.isOnHold().local) {
      session.unhold();
    }
    this._sessions.forEach((sessionItem, sessionItemId) => {
      if (session.id !== sessionItemId) {
        if (!sessionItem.isOnHold().local) {
          sessionItem.hold();
        }
      }
    });
    this._setActiveSession(session);
    this._updateCurrentSessionAndSessions(session);
  }

  async startRecord(sessionId) {
    const session = this._sessions.get(sessionId);
    if (!session) {
      return;
    }
    try {
      await session.startRecord();
      session.isOnRecord = true;
      console.log('Recording Started');
    } catch (e) {
      session.isOnRecord = false;
      console.error(e);
    }
    this._updateCurrentSessionAndSessions(session);
  }

  async stopRecord(sessionId) {
    const session = this._sessions.get(sessionId);
    if (!session) {
      return;
    }
    try {
      await session.stopRecord();
      session.isOnRecord = false;
      console.log('Recording Stopped');
    } catch (e) {
      session.isOnRecord = true;
      console.error(e);
    }
    this._updateCurrentSessionAndSessions(session);
  }

  async park(sessionId) {
    const session = this._sessions.get(sessionId);
    if (!session) {
      return;
    }
    try {
      await session.park();
      console.log('Parked');
    } catch (e) {
      console.error(e);
    }
  }

  async transfer(transferNumber, sessionId) {
    const session = this._sessions.get(sessionId);
    if (!session) {
      return;
    }
    try {
      await session.transfer(transferNumber);
      console.log('Transferred');
    } catch (e) {
      console.error(e);
    }
  }

  async transferWarm(transferNumber, sessionId) {
    const session = this._sessions.get(sessionId);
    if (!session) {
      return;
    }
    try {
      await session.hold();
      const newSession = session.ua.invite(transferNumber, {
        media: this.acceptOptions.media
      });
      newSession.once('accepted', async () => {
        try {
          await session.warmTransfer(newSession);
          console.log('Transferred');
        } catch (e) {
          console.error(e);
        }
      });
    } catch (e) {
      console.error(e);
    }
  }

  async flip(flipValue, sessionId) {
    const session = this._sessions.get(sessionId);
    if (!session) {
      return;
    }
    try {
      await session.flip(flipValue);
      console.log('Flipped');
    } catch (e) {
      console.error(e);
    }
  }

  sendDTMF(dtmfValue, sessionId) {
    this._sessionHandleWithId(sessionId, (session) => {
      try {
        session.dtmf(dtmfValue);
      } catch (e) {
        console.error(e);
      }
    });
  }

  hangup(sessionId) {
    this._sessionHandleWithId(sessionId, (session) => {
      try {
        session.terminate();
      } catch (e) {
        console.error(e);
        this._removeSession(session);
      }
    });
  }

  toVoiceMail(sessionId) {
    this._sessionHandleWithId(sessionId, (session) => {
      try {
        session.toVoiceMail();
      } catch (e) {
        console.error(e);
        this._removeSession(session);
      }
    });
  }

  replyWithMessage(sessionId, replyOptions) {
    this._sessionHandleWithId(sessionId, (session) => {
      try {
        session.replyWithMessage(replyOptions);
      } catch (e) {
        console.error(e);
        this._removeSession(session);
      }
    });
  }

  _sessionHandleWithId(sessionId, func) {
    const session = this._sessions.get(sessionId);
    if (!session) {
      return null;
    }
    return func(session);
  }

  makeCall({ toNumber, fromNumber, homeCountryId }) {
    const session = this._webphone.userAgent.invite(toNumber, {
      media: this.acceptOptions.media,
      fromNumber,
      homeCountryId,
    });
    session.direction = callDirections.outbound;
    session.callStatus = sessionStatus.connecting;
    session.creationTime = Date.now();
    this._onAccepted(session);
    if (this._activeSession && !this._activeSession.isOnHold().local) {
      this._activeSession.hold();
    }
    this._addSession(session);
    this._setActiveSession(session);
    this._resetMinimized();
    return session;
  }

  _addSession(session) {
    this._sessions.set(session.id, session);
    this.store.dispatch({
      type: this.actionTypes.updateSessions,
      sessions: this._sessions,
    });
  }

  _removeSession(session) {
    this._cleanActiveSession(session);
    this._sessions.delete(session.id);
    this.store.dispatch({
      type: this.actionTypes.updateSessions,
      sessions: this._sessions,
    });
  }

  _setActiveSession(session) {
    this._activeSession = session;
    this.store.dispatch({
      type: this.actionTypes.updateCurrentSession,
      session,
    });
  }

  _removeActiveSession() {
    this._activeSession = null;
    this.store.dispatch({
      type: this.actionTypes.destroyCurrentSession,
    });
  }

  _cleanActiveSession(session) {
    if (session !== this._activeSession) {
      return;
    }
    this._removeActiveSession();
  }

  _updateCurrentSessionAndSessions(session) {
    if (session === this._activeSession) {
      this._updateCurrentSession(session);
    }
    this._updateSessions();
  }

  _updateCurrentSession(session) {
    this.store.dispatch({
      type: this.actionTypes.updateCurrentSession,
      session,
    });
  }

  _updateSessions() {
    this.store.dispatch({
      type: this.actionTypes.updateSessions,
      sessions: this._sessions,
    });
  }

  toggleMinimized() {
    this.store.dispatch({
      type: this.actionTypes.toggleMinimized,
    });
  }

  _resetMinimized() {
    this.store.dispatch({
      type: this.actionTypes.resetMinimized,
    });
  }

  async _retrySleep() {
    if (this.connectRetryCounts < 3) {
      await sleep(FIRST_THREE_RETRIES_DELAY);
    }
    if (this.connectRetryCounts === 3) {
      await sleep(FOURTH_RETRIES_DELAY);
    }
    if (this.connectRetryCounts === 4) {
      await sleep(FIFTH_RETRIES_DELAY); // sleep 30 seconds
    }
    if (this.connectRetryCounts > 4) {
      await sleep(MAX_RETRIES_DELAY); // sleep 30 seconds
    }
  }

  get status() {
    return this.state.status;
  }

  get activeSession() {
    return this._activeSession;
  }

  get originalSessions() {
    return this._sessions;
  }

  get ready() {
    return this.state.status === moduleStatus.ready;
  }

  get minimized() {
    return this.state.minimized;
  }

  get currentSession() {
    return this.state.currentSession;
  }

  get sessions() {
    return this.state.sessions;
  }

  get videoElementPrepared() {
    return this.state.videoElementPrepared;
  }

  get enabled() {
    return this.videoElementPrepared && this._rolesAndPermissions.webphoneEnabled;
  }

  get connectionStatus() {
    return this.state.connectionStatus;
  }

  get webphoneCounts() {
    return this._storage.getItem(this._storageWebphoneCountsKey);
  }

  get connectRetryCounts() {
    return this.state.connectRetryCounts;
  }

  get acceptOptions() {
    return {
      media: {
        render: {
          remote: this._remoteVideo,
          local: this._localVideo,
        }
      }
    };
  }
}
