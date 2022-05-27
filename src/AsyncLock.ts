
export interface Opts {
  domainReentrant?: boolean; //default false
  timeout?: number; //default 0 never
  maxOccupationTime?: number; //default 0 never
  maxPending?: number; //deafult 1000
  skipQueue?: boolean; // default false
}

export class AsyncLock {
  // format: {key : [fn, fn]}
  // queues[key] = null indicates no job running for key
  queues = {};
  // lock is reentrant for same domain
  domainReentrant = false;
  // domain of current running func {key : fn}
  domains = {};
  timeout = 0 //never
  maxOccupationTime: number
  maxPending: number = 1000

  constructor(opts?: Opts) {
    this.domainReentrant = opts?.domainReentrant ?? false
    // lock is reentrant for same domain
    if (this.domainReentrant) {
      if (typeof process === 'undefined' || typeof process['domain'] === 'undefined') {
        throw new Error(
          'Domain-reentrant locks require `process.domain` to exist. Please flip `opts.domainReentrant = false`, ' +
          'use a NodeJS version that still implements Domain, or install a browser polyfill.');
      }
    }
    this.timeout = opts?.timeout ?? 0 //never
    this.maxOccupationTime = opts?.maxOccupationTime ?? 0 //never
    if (opts?.maxPending != undefined) {
      if (opts.maxPending === Infinity || (Number.isInteger(opts.maxPending) && opts.maxPending >= 0)) {
        this.maxPending = opts.maxPending;
      }
    }
  }






  /**
   * Acquire Locks
   *
   * @param {String|Array} key 	resource key or keys to lock
   * @param {function} fn 	async function
   * @param {function} cb 	callback function, otherwise will return a promise
   * @param {Object} opts 	options
   */
  acquire<T>(key: string, fn: Function, opts: Opts = {}): Promise<T> {

    if (typeof (fn) !== 'function') {
      throw new Error('You must pass a function to execute');
    }

    // faux-deferred promise using new Promise() (as Promise.defer is deprecated)
    let resolveFunc: null | Function = null;
    let rejectFunc: null | Function = null;
    let promise: null | Promise<T> = null;

    // will return a promise
    promise = new Promise<T>(function (resolve, reject) {
      resolveFunc = resolve;
      rejectFunc = reject;
    });


    let fulfilled = false;
    let timer: null | NodeJS.Timer = null;
    let occupationTimer: null | NodeJS.Timer = null;
    const self = this;

    const done = function (locked: boolean, err, ret) {
      if (occupationTimer) {
        clearTimeout(occupationTimer);
        occupationTimer = null;
      }

      if (locked) {
        if (!!self.queues[key] && self.queues[key].length === 0) {
          delete self.queues[key];
        }
        if (self.domainReentrant) {
          delete self.domains[key];
        }
      }

      if (!fulfilled) {
        //promise mode
        if (err) {
          rejectFunc!(err);
        }
        else {
          resolveFunc!(ret);
        }
        fulfilled = true;
      }

      if (locked) {
        //run next taskFn func
        if (!!self.queues[key] && self.queues[key].length > 0) {
          self.queues[key].shift()();
        }
      }
    };

    let exec = function (locked: boolean) {
      if (fulfilled) { // may due to timed out
        return done(locked, null, null);
      }

      if (timer) {
        clearTimeout(timer);
        timer = null;
      }

      if (self.domainReentrant && locked) {
        self.domains[key] = process['domain'];
      }

      // Promise mode
      self._promiseTry(function () {
        return fn();
      })
        .then(function (ret) {
          done(locked, null, ret);
        }, function (err) {
          done(locked, err, null);
        });
    };

    // --------------------create task-----------------------------
    if (self.domainReentrant && !!process['domain']) {
      exec = process['domain'].bind(exec);
    }

    if (!self.queues[key]) {
      self.queues[key] = [];
      exec(true);
    }
    else if (self.domainReentrant && !!process['domain'] && process['domain'] === self.domains[key]) {
      // If code is in the same domain of current running task, run it directly
      // Since lock is re-enterable
      exec(false);
    }
    else if (self.queues[key].length >= self.maxPending) {
      done(false, new Error('Too many pending tasks in queue ' + key), null);
    }
    else {
      const taskFn = function () {
        exec(true);
      };
      if (opts.skipQueue) {
        self.queues[key].unshift(taskFn);
      } else {
        self.queues[key].push(taskFn);
      }
      const timeout = opts.timeout || self.timeout;
      if (timeout) {
        timer = setTimeout(function () {
          timer = null;
          done(false, new Error('async-lock timed out in queue ' + key), null);
        }, timeout);
      }
    }

    const maxOccupationTime = opts.maxOccupationTime || self.maxOccupationTime;
    if (maxOccupationTime) {
      occupationTimer = setTimeout(function () {
        if (!!self.queues[key]) {
          done(false, new Error('Maximum occupation time is exceeded in queue ' + key), null);
        }
      }, maxOccupationTime);
    }

    return promise;
  };


  /*
   *	Whether there is any running or pending asyncFunc
   *
   *	@param {String} key
   */
  isBusy(key) {
    if (!key) {
      return Object.keys(this.queues).length > 0;
    }
    else {
      return !!this.queues[key];
    }
  };

  /**
   * Promise.try() implementation to become independent of Q-specific methods
   */
  _promiseTry = function (fn) {
    try {
      return Promise.resolve(fn());
    } catch (e) {
      return Promise.reject(e);
    }
  }
}
