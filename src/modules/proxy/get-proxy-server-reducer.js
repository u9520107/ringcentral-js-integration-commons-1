import proxyActions from './proxy-actions';
import { prefixActions } from '../../lib/redux-helper';

/**
 * @function
 * @param {String} prefix
 * @param {Object} transport
 * @param {Function} moduleReducer
 */
export default function getProxyServerReducer(prefix, transport, moduleReducer) {
  const actions = prefixActions(proxyActions, prefix);
  return (state, action) => {
    if (!state) {
      return {
        module: moduleReducer(),
        lastAction: null,
        actionNumber: -1,
      };
    }
    if (!action) {
      return state;
    }
    const nextActionNumber = state.actionNumber + 1;
    transport.push({
      payload: {
        type: actions.action,
        action,
        actionNumber: nextActionNumber,
      },
    });
    return {
      module: moduleReducer(state.module, action),
      lastAction: action,
      actionNumber: nextActionNumber,
    };
  };
}
