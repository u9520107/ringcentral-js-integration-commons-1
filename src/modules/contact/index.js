import RcModule, { addModule } from '../../lib/rc-module';

import SymbolMap from 'data-types/symbol-map';
import KeyValueMap from 'data-types/key-value-map';
import { combineReducers } from 'redux';

import CompanyContact from './company-contact';
import AddressBook from './address-book';

const symbols = new SymbolMap([
  'api',
  'platform',
  'settings',
]);

/**
 * @class
 * @description Contact module
 */
export default class Contact extends RcModule {
  /**
   * @function
   */
  constructor(options) {
    super({
      ...options,
    });
    const {
      api,
      platform,
      settings,
      prefix,
    } = options;

    this[symbols.api] = api;
    this[symbols.platform] = platform;
    this[symbols.settings] = settings;

    this::addModule('companyContact', new CompanyContact({
      getState: () => this.state.companyContact,
      prefix,
      api,
      platform,
      settings,
    }));

    this::addModule('addressBook', new AddressBook({
      getState: () => this.state.addressBook,
      prefix,
      api,
      platform,
      settings,
    }));
  }

  get reducer() {
    console.log('reducer');
    return combineReducers({
      companyContact: this.companyContact.reducer,
      addressBook: this.addressBook.reducer,
    });
  }
}
