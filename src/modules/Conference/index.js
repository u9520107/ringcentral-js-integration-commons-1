import mask from 'json-mask';
import DataFetcher from '../../lib/DataFetcher';

const DEFAULT_MASK = 'phoneNumber,hostCode,participantCode,phoneNumbers(country,phoneNumber)';

export default class Conference extends DataFetcher {
  constructor({
       auth,
       client,
       regionSettings,
       ...options,
    }) {
    super({
      name: 'conference',
      client,
      fetchFunction: async () => mask(
                        await client.account().extension().conferencing().get(), DEFAULT_MASK
                     ),
      ...options,
    });
    this._auth = auth;
    this._client = client;
    this.addSelector(
       'conferenceNumbers',
       () => regionSettings.countryCode,
       () => this.data,
       (isoCode, data) => {
         if (!data) {
           return data;
         }
         const countrys = data.phoneNumbers.find(value => value.country.isoCode === isoCode);
         if (typeof countrys === 'undefined') {
           return data;
         }
         return {
           ...data,
           phoneNumber: countrys.phoneNumber,
           phoneNumbers: data.phoneNumbers.filter(value =>
                         value.phoneNumber !== countrys.phoneNumber),
         };
       }
    );
  }
  get conferenceNumbers() {
    return this._selectors.conferenceNumbers();
  }

}
