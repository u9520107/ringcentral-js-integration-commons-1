import { expect } from 'chai';
import getProxyServerReducer from '../../../src/modules/proxy/get-proxy-server-reducer';
import { prefixActions } from '../../../src/lib/redux-helper';

import proxyActions from '../../../src/modules/proxy/proxy-actions';

const silentTransport = {
  push() { },
};
const sampleReducer = (state, action) => {
  if (!state) {
    return {
      count: 0,
    };
  }
  if (!action) {
    return state;
  }
  switch (action.type) {
    case 'inc':
      return {
        count: state.count + 1,
      };
    case 'dec':
      return {
        count: state.count - 1,
      };
    default:
      return state;
  }
};

describe('getProxyServerReducer', () => {
  it('should be a function', () => {
    expect(getProxyServerReducer).to.be.a('function');
  });
  it('should return a reducer', () => {
    const reducer = getProxyServerReducer(null, silentTransport, sampleReducer);
    expect(reducer).to.be.a('function');
    expect(reducer()).to.deep.equal({
      lastAction: null,
      actionNumber: -1,
      module: {
        count: 0,
      },
    });
  });
  describe('proxyServerReducer', () => {
    const reducer = getProxyServerReducer(null, silentTransport, sampleReducer);
    it('should return state property `module` with the initial state of the input reducer', () => {
      expect(reducer()).to.deep.equal({
        lastAction: null,
        actionNumber: -1,
        module: sampleReducer(),
      });
    });
    it('should return originalState if no action is given', () => {
      const originalState = {};
      expect(reducer(originalState)).to.equal(originalState);
    });
    it('should keep track of any action in lastAction and increment the actionNumber', () => {
      const action = {
        type: 'foo',
      };
      Array.apply(null, new Array(5)).map(() => ({
        lastAction: null,
        actionNumber: Math.floor(Math.random() * 20),
        module: sampleReducer(),
      })).forEach(originalState => {
        expect(reducer(originalState, action)).to.deep.equal({
          lastAction: action,
          actionNumber: originalState.actionNumber + 1,
          module: sampleReducer(originalState.module, action),
        });
      });
    });
    it('should apply any actions to the module state with input reducer', () => {
      Array.apply(null, new Array(5)).map(() => ({
        lastAction: null,
        actionNumber: Math.floor(Math.random() * 20),
        module: sampleReducer(),
      })).forEach(originalState => {
        expect(reducer(originalState, {
          type: 'inc',
        })).to.deep.equal({
          lastAction: {
            type: 'inc',
          },
          actionNumber: originalState.actionNumber + 1,
          module: sampleReducer(originalState.module, {
            type: 'inc',
          }),
        });
        expect(reducer(originalState, {
          type: 'dec',
        })).to.deep.equal({
          lastAction: {
            type: 'dec',
          },
          actionNumber: originalState.actionNumber + 1,
          module: sampleReducer(originalState.module, {
            type: 'dec',
          }),
        });
      });
    });
    it('should call the push function of transport with action data', () => {
      const transport = {
        push(...args) { this.handler(...args); },
      };
      const serverReducer = getProxyServerReducer(null, transport, sampleReducer);
      const initialState = serverReducer();
      let checked = 0;
      Array.apply(null, new Array(5)).map((_, idx) => ({
        type: `action-${idx}`,
      })).forEach(action => {
        transport.handler = payload => {
          expect(payload).to.deep.equal({
            payload: {
              type: proxyActions.action,
              action,
              actionNumber: initialState.actionNumber + 1,
            },
          });
          checked++;
        };
        serverReducer(initialState, action);
        transport.handler = null;
      });
      expect(checked).to.equal(5);
    });
    it(
      'should call the push function with prefixed proxyActions if prefix parameter was set',
      () => {
        const prefix = 'foo';
        const prefixedProxyActions = prefixActions(proxyActions, prefix);
        let check = false;
        const transport = {
          push(params) {
            expect(params.payload.type).to.equal(prefixedProxyActions.action);
            check = true;
          },
        };
        const serverReducer = getProxyServerReducer(prefix, transport, sampleReducer);
        const initialState = serverReducer();
        serverReducer(initialState, {
          type: 'foo',
        });
        expect(check).to.be.true;
      }
    );
  });
});
