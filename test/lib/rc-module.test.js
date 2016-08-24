import { expect } from 'chai';
import RcModule, { addModule, initFunction, suppressInit } from '../../src/lib/rc-module';
import { ActionMap, prefixActions } from '../../src/lib/redux-helper';
import { createStore, combineReducers } from 'redux';
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
      describe('default reducer', async () => {
        it('should return empty object as initial state', async () => {
          let resolver = null;
          const promiseForStore = new Promise(resolve => {
            resolver = resolve;
          });
          const module = new RcModule({
            promiseForStore,
          });
          resolver(createStore(module.reducer));
          await promiseForStore;
          expect(module.state).to.deep.equal({});
        });
        it('should ignore actions', async () => {
          let resolver = null;
          const promiseForStore = new Promise(resolve => {
            resolver = resolve;
          });
          const module = new RcModule({
            promiseForStore,
          });
          resolver(createStore(module.reducer));
          await promiseForStore;
          module.store.dispatch({
            type: 'test',
          });
          expect(module.state).to.deep.equal({});
        });
      });
    });
    describe('store', async () => {
      it('should throw error if trying to access before promiseForStore is resolved', () => {
        const module = new RcModule({
          promiseForStore: neverResolved,
        });
        expect(() => module.store).to.be.throw();
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
      const REDUCER = Symbol();
      class Test extends RcModule {
        constructor(options) {
          super(options);
          this[REDUCER] = (state, action) => {
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
          return this[REDUCER];
        }
      }
      it('should be undefined if promiseForStore is not fulfilled', () => {
        const module = new Test({
          promiseForStore: neverResolved,
        });
        expect(() => module.state).to.throw();
      });
      it('should return initial state after promiseForStore is resolved', async () => {
        let resolver = null;
        const promiseForStore = new Promise(resolve => {
          resolver = resolve;
        });
        const module = new Test({
          promiseForStore,
        });
        resolver(createStore(module.reducer));
        await promiseForStore;
        expect(module.state).to.deep.equal({
          value: 0,
        });
      });
      it('should return new state after action has been dispatched', async () => {
        let resolver = null;
        const promiseForStore = new Promise(resolve => {
          resolver = resolve;
        });
        const module = new Test({
          promiseForStore,
        });
        resolver(createStore(module.reducer));
        await promiseForStore;
        expect(module.state).to.deep.equal({
          value: 0,
        });
        module.store.dispatch({ type: 'inc' });
        expect(module.state).to.deep.equal({
          value: 1,
        });
      });
    });
    describe('prefix', async () => {
      it('should be undefined if not defined in options', () => {
        const module = new RcModule({
          promiseForStore: neverResolved,
        });
        expect(module.prefix).to.be.undefined;
      });
      it('should return prefix string if defined in options', () => {
        const prefix = uuid.v4();
        const module = new RcModule({
          promiseForStore: neverResolved,
          prefix,
        });
        expect(module.prefix).to.equal(prefix);
      });
    });
    describe('modulePath', async () => {
      const REDUCER = Symbol();
      class RootModule extends RcModule {
        constructor(options) {
          super(options);
          this::addModule('subModule', new RcModule({
            ...options,
            getState: () => this.state.sub,
          }));
          this[REDUCER] = combineReducers({
            sub: this.subModule.reducer,
          });
        }
        get reducer() {
          return this[REDUCER];
        }
      }
      const module = new RootModule({
        promiseForStore: neverResolved,
      });
      it('should be `root` for root modules', () => {
        expect(module.modulePath).to.equal('root');
      });
      it('should return `.` delimited module structure path', () => {
        expect(module.subModule.modulePath).to.equal('root.subModule');
      });
    });
  });
});

describe('initFunction decorator', async () => {
  it('should be a function', () => {
    expect(initFunction).to.be.a('function');
  });
  it('should decorates a class method so the method is called after promiseForStore resolves',
    async () => {
      let initRun = false;
      let resolver = null;
      const promiseForStore = new Promise(resolve => {
        resolver = resolve;
      });
      class Test extends RcModule {
        @initFunction
        myFunction() {
          initRun = true;
        }
      }
      const module = new Test({
        promiseForStore,
      });
      resolver(createStore(module.reducer));
      await promiseForStore;
      expect(initRun).to.be.true;
    }
  );
  it('should make the class method unable to be called', async () => {
    let initRun = false;
    let resolver = null;
    const promiseForStore = new Promise(resolve => {
      resolver = resolve;
    });
    class Test extends RcModule {
      @initFunction
      myFunction() {
        initRun = true;
      }
    }
    const module = new Test({
      promiseForStore,
    });
    resolver(createStore(module.reducer));
    await promiseForStore;
    expect(initRun).to.be.true;
    expect(() => module.myFunction()).to.throw();
  });
  it('should make augmented function\'s toString work as intended', () => {
    class Test extends RcModule {
      @initFunction
      myFunction() { this.a = 1; }
    }
    function myFunction() { this.a = 1; }
    expect(
      Test.prototype.myFunction.toString()
        .replace(/(\n|\r|\r\n) */g, '  ')
    ).to.equal(
      myFunction.toString()
        .replace(/(\n|\r|\r\n) */g, '  ')
      );
  });
  it('should throw error when used to decorate class properties that is not a function', () => {
    expect(() => {
      class Test extends RcModule {
        @initFunction
        get name() { return 'test'; }
      }
    }).to.throw();
  });
});

describe('suppressInit', async () => {
  it('should be a function', () => {
    expect(suppressInit).to.be.a('function');
  });
  it('should be able to suppress initFunction if called before promiseForStore', async () => {
    let initRun = false;
    let resolver = null;
    const promiseForStore = new Promise(resolve => {
      resolver = resolve;
    });
    class Test extends RcModule {
      @initFunction
      myFunction() {
        initRun = true;
      }
    }
    const module = new Test({
      promiseForStore,
    });
    module::suppressInit();
    resolver(createStore(module.reducer));
    await promiseForStore;
    expect(initRun).to.be.false;
  });
});

describe('addModule', () => {
  it('should be a function', () => {
    expect(addModule).to.be.a('function');
  });
  it('should throw if scope is not bound to a RcModule instance', () => {
    expect(() => {
      addModule();
    }).to.throw('addModule should be called with scope binding to target module');
    const foo = {};
    const bar = {};
    expect(() => {
      foo::addModule('sub', bar);
    }).to.throw('addModule should be called with scope binding to target module');
  });

  it('should throw if property of the same name exists', () => {
    const module = new RcModule({
      promiseForStore: neverResolved,
    });
    const foo = {};
    const bar = {};
    let isFooAdded = false;
    expect(() => {
      module::addModule('sub', foo);
      isFooAdded = true;
      module::addModule('sub', bar);
    }).to.throw();
    expect(isFooAdded).to.be.true;
  });

  it('should set modulePath for the subModule', () => {
    const module = new RcModule({
      promiseForStore: neverResolved,
    });
    const subModule = new RcModule({
      promiseForStore: neverResolved,
    });
    module::addModule('sub', subModule);
    expect(module.modulePath).to.equal('root');
    expect(subModule.modulePath).to.equal('root.sub');
  });
  it('should not set the modulePath for a subModule if the subModule is added as a subModule of a different name', () => {
    const module = new RcModule({
      promiseForStore: neverResolved,
    });
    const subModule = new RcModule({
      promiseForStore: neverResolved,
    });
    module::addModule('sub', subModule);
    expect(module.modulePath).to.equal('root');
    expect(subModule.modulePath).to.equal('root.sub');
    module::addModule('sub2', subModule);
    expect(module.sub2).to.equal(subModule);
    expect(module.sub2.modulePath).to.equal('root.sub');
  });

  // it('should define the module as a named property of the target', () => {
  //   const target = {};
  //   const module = {};
  //   const name = 'foo';
  //   target::addModule(name, module);
  //   expect(target).to.have.ownProperty(name);
  //   expect(target[name]).to.equal(module);
  // });
  // it('should throw error when trying to add another module with the same name', () => {
  //   const target = {};
  //   const module1 = {};
  //   const module2 = {};
  //   const name = 'foo';
  //   target::addModule(name, module1);
  //   expect(() => {
  //     target::addModule(name, module2);
  //   }).to.throw(`module '${name}' already exists...`);
  // });
});
