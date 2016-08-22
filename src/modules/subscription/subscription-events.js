import KeyValueMap from 'data-types/key-value-map';
import subscriptionStatus from './subscription-status';


const eventDefinition = {
  ...subscriptionStatus,
};

export const subscriptionEvents = new KeyValueMap(eventDefinition);

const eventTypeDefinition = {
  notification: 'NOTIFICATION',
  statusChanged: 'STATUS_CHANGED',
};

export const subscriptionEventTypes = new KeyValueMap(eventTypeDefinition);
