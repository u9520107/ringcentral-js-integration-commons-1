import { expect } from 'chai';
import RcModule, { addModule } from '../../src/lib/rc-module';
import { ActionMap, prefixActions } from '../../src/lib/redux-helper';
import { createStore } from 'redux';
import uuid from 'uuid';
const neverResolved = new Promise(() => { });

describe('RcModule', () => {
  it('should be a constructor function', () => {
    expect(RcModule).to.be.a('function');
  });
  it('should return a RcModule instance', () => {
    const module = new RcModule({
      promiseForStore: neverResolved,
    });
    expect(module).to.be.instanceof(RcModule);
  });
  describe('constructor options parameter', () => {
    describe('getState', () => {
      it('should be a function', () => {
        expect(() => {
          const module = new RcModule({
            promiseForStore: neverResolved,
            getState: {},
          });
        }).to.throw('The `getState` options property must be of type function');
      });
    });
    describe('promiseForStore', () => {
      it('should require a promiseForStore options property', () => {
        expect(() => {
          const module = new RcModule();
        }).to.throw(
          'The `promiseForStore` options property must be a promise or promise-like object'
          );
        expect(() => {
          const module = new RcModule({
            promiseForStore: {},
          });
        }).to.throw(
          'The `promiseForStore` options property must be a promise or promise-like object'
          );
        expect(() => {
          const module = new RcModule({
            promiseForStore: neverResolved,
          });
        }).to.not.throw();
      });
    });
    describe('prefix', () => {
      it('should be null-like or string', () => {
        const prefixes = [{}, 3, true, []];
        prefixes.forEach(p => {
          expect(() => {
            const module = new RcModule({
              promiseForStore: neverResolved,
              prefix: p,
            });
          }).to.throw('The `prefix` options property must be null, undefined, or a string');
        });
        expect(() => {
          const module = new RcModule({
            promiseForStore: neverResolved,
            prefix: 'string',
          });
        }).to.not.throw();
      });
    });
    describe('action', () => {
      it('should be put to `actions` instance property if present', () => {
        const actions = new ActionMap([
          'actionA',
          'actionB',
        ]);
        const module = new RcModule({
          promiseForStore: neverResolved,
          actions,
        });
        expect(module.actions).to.deep.equal(actions);
      });
    });
  });
});

describe('RcModule instance', async () => {
  describe('RcModule instance properties', async () => {
    describe('actions', async () => {
      it('should be undefined if not set in options', () => {
        const module = new RcModule({
          promiseForStore: neverResolved,
        });
        expect(module.actions).to.be.undefined;
      });
      it('should should be prefixed if prefix is set', () => {
        const prefix = uuid.v4();
        const actions = new ActionMap([
          'action1',
          'action2',
        ]);
        const module = new RcModule({
          prefix,
          promiseForStore: neverResolved,
          actions,
        });
        expect(module.actions).to.deep.equal(prefixActions(actions, prefix));
      });
    });
    describe('reducer', async () => {
      it('should have a default reducer', () => {
        const module = new RcModule({
          promiseForStore: neverResolved,
        });
        expect(module.reducer).to.be.a('function');
      });
    });
    describe('store', async () => {
      it('should be undefined when promiseForStore is not fulfilled', () => {
        const module = new RcModule({
          promiseForStore: neverResolved,
        });
        expect(module.store).to.be.undefined;
      });
      it('should return a store object after promiseForStore has been fulfilled', async () => {
        let resolver;
        const promiseForStore = new Promise((resolve) => {
          resolver = resolve;
        });
        const module = new RcModule({
          promiseForStore,
        });
        resolver(createStore(module.reducer));
        await promiseForStore;
        expect(module.store).to.exists;
        expect(module.store.dispatch).to.be.a('function');
        expect(module.store.getState).to.be.a('function');
      });
    });
    describe('state', async () => {
      class Test extends RcModule {
        constructor(options) {
          super(options);
          this._reducer = (state, action) => {
            if (!state) return { value: 0 };
            if (!action) return state;
            switch (action) {
              default:
                return {
                  value: state.value + 1,
                };
            }
          };
        }
        get reducer() {
          return this._reducer;
        }
      }
      it('should be undefined if promiseForStore is not fulfilled', () => {
        const module = new Test({
          promiseForStore: neverResolved,
        });
        expect(module.state).to.be.undefined;
      });
    });
  });

});


describe('addModule', () => {
  it('should be a function', () => {
    expect(addModule).to.be.a('function');
  });
  it('should define the module as a named property of the target', () => {
    const target = {};
    const module = {};
    const name = 'foo';
    target::addModule(name, module);
    expect(target).to.have.ownProperty(name);
    expect(target[name]).to.equal(module);
  });
  it('should throw error when trying to add another module with the same name', () => {
    const target = {};
    const module1 = {};
    const module2 = {};
    const name = 'foo';
    target::addModule(name, module1);
    expect(() => {
      target::addModule(name, module2);
    }).to.throw(`module '${name}' already exists...`);
  });
});
