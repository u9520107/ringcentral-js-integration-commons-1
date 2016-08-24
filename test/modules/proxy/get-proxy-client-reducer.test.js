import { expect } from 'chai';
import getProxyClientReducer from '../../../src/modules/proxy/get-proxy-client-reducer';
import proxyActions from '../../../src/modules/proxy/proxy-actions';
import { prefixActions } from '../../../src/lib/redux-helper';

describe('getProxyClientReducer', () => {
  const sampleReducer = (state, action) => {
    if (!state) {
      return {
        count: 0,
      };
    }
    if (!action) return state;
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
  it('should be a function', () => {
    expect(getProxyClientReducer).to.be.a('function');
  });
  it('should return a reducer', () => {
    const reducer = getProxyClientReducer('', sampleReducer);
    expect(reducer).to.be.a('function');
  });
  it('should accept `prefix` parameter and resulting reducer should only accept prefixed proxyActions', () => {
    const prefix = 'foo';
    const prefixedActions = prefixActions(proxyActions, prefix);
    const reducer = getProxyClientReducer(prefix, sampleReducer);
    const initialState = reducer();
    expect(reducer(initialState, {
      type: proxyActions.action,
      action: {
        type: 'inc',
      },
      actionNumber: 0,
    })).to.deep.equal(initialState);
    expect(reducer(initialState, {
      type: prefixedActions.action,
      action: {
        type: 'inc',
      },
      actionNumber: 0,
    })).to.deep.equal({
      lastAction: {
        type: 'inc',
      },
      actionNumber: 0,
      module: sampleReducer(initialState.module, {
        type: 'inc',
      }),
    });
  });

  describe('proxyClientReducer', () => {
    const reducer = getProxyClientReducer('', sampleReducer);
    it('should return initial state with initial state of the input reducer', () => {
      expect(reducer()).to.deep.equal({
        lastAction: null,
        actionNumber: -1,
        module: sampleReducer(),
      });
    });
    it('should return original state if no action is given', () => {
      const originalState = {};
      expect(reducer(originalState)).to.equal(originalState);
    });
    it('should return original state if action type of not recognized', () => {
      const originalState = {};
      expect(reducer(originalState, { type: 'foo' })).to.equal(originalState);
    });
    describe('proxyAction.action', () => {
      it('should apply the action to the module state with moduleReducer', () => {
        const initialState = reducer();
        const a1 = {
          type: 'inc',
        };
        const a2 = {
          type: 'dec',
        };
        expect(reducer(initialState, {
          type: proxyActions.action,
          actionNumber: 0,
          action: a1,
        })).to.deep.equal({
          actionNumber: 0,
          lastAction: a1,
          module: sampleReducer(initialState.module, a1),
        });
        expect(reducer(initialState, {
          type: proxyActions.action,
          actionNumber: 0,
          action: a2,
        })).to.deep.equal({
          actionNumber: 0,
          lastAction: a2,
          module: sampleReducer(initialState.module, a2),
        });
      });
      it('should only apply the action if actionNumber is in sequence', () => {
        const initialState = reducer();
        const a1 = {
          type: 'inc',
        };
        expect(reducer(initialState, {
          type: proxyActions.action,
          actionNumber: 1,
          action: a1,
        })).to.deep.equal(initialState);
        expect(reducer(initialState, {
          type: proxyActions.action,
          actionNumber: -1,
          action: a1,
        })).to.deep.equal(initialState);
        expect(reducer(initialState, {
          type: proxyActions.action,
          actionNumber: 0,
          action: a1,
        })).to.deep.equal({
          actionNumber: 0,
          lastAction: a1,
          module: sampleReducer(initialState.module, a1),
        });
      });
    });
    describe('proxyAction.sync', () => {
      it('should take the state in sync action', () => {
        const initialState = reducer();
        const states = Array.apply(null, new Array(5)).map(() => ({
          actionNumber: Math.floor(Math.random() * 10),
          lastAction: {
            type: Math.random() > 0.5 ? 'inc' : 'dec',
          },
          module: {
            count: Math.floor(Math.random() * 200),
          },
        }));
        states.forEach(state => {
          expect(reducer(initialState, {
            type: proxyActions.sync,
            ...state,
          })).to.deep.equal(state);
        });
      });
    });
  });
});
