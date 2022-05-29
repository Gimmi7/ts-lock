# async-lock

Lock on asynchronous code

* ES6 promise supported
* Multiple keys lock supported
* Timeout supported
* Occupation time limit supported
* Pending task limit supported
* Domain reentrant supported
* 100% code coverage

## Disclaimer

This package is inspired by async-lock (https://github.com/rogierschouten/async-lock).
Rewrite it with Typescript and remove the callback mode.

## Rationale

Put all async task to a queue, then run them one by one.

## Why do you need locking on single threaded nodejs?

Nodejs is single threaded, and the code execution never gets interrupted inside an event loop, so locking is unnecessary? This is true ONLY IF your critical section can be executed inside a single event loop.
However, if you have any async code inside your critical section (it can be simply triggered by any I/O operation, or timer), your critical logic will across multiple event loops, therefore it's not concurrency safe!

Consider the following code
```js
redis.get('key', function(err, value) {
	redis.set('key', value * 2);
});
```
The above code simply multiply a redis key by 2.
However, if two users run concurrently, the execution order may like this
```
user1: redis.get('key') -> 1
user2: redis.get('key') -> 1
user1: redis.set('key', 1 x 2) -> 2
user2: redis.set('key', 1 x 2) -> 2
```
Obviously it's not what you expected


With asyncLock, you can easily write your async critical section
```js
lock.acquire('key', function(cb) {
	// Concurrency safe
	redis.get('key', function(err, value) {
		redis.set('key', value * 2, cb);
	});
}, function(err, ret) {
});
```

## Get Started

```js
var AsyncLock = require('async-lock');
var lock = new AsyncLock();

/**
 * @param {String|Array} key 	resource key or keys to lock
 * @param {function} fn 	execute function
 * @param {function} cb 	(optional) callback function, otherwise will return a promise
 * @param {Object} opts 	(optional) options
 */
lock.acquire(key, function(done) {
	// async work
	done(err, ret);
}, function(err, ret) {
	// lock released
}, opts);

// Promise mode
lock.acquire(key, function() {
	// return value or promise
}, opts).then(function() {
	// lock released
});
```

## Error Handling

```js
// Promise mode
lock.acquire(key, function() {
	throw new Error('error');
}).catch(function(err) {
	console.log(err.message) // output: error
});
```

## Acquire multiple keys

```js
lock.acquire([key1, key2], fn, cb);
```

## Domain reentrant lock

Lock is reentrant in the same domain

```js
var domain = require('domain');
var lock = new AsyncLock({domainReentrant : true});

var d = domain.create();
d.run(function() {
	lock.acquire('key', function() {
		//Enter lock
		return lock.acquire('key', function() {
			//Enter same lock twice
		});
	});
});
```

## Options

```js
// Specify timeout - max amount of time an item can remain in the queue before acquiring the lock
var lock = new AsyncLock({timeout: 5000});
lock.acquire(key, fn, function(err, ret) {
	// timed out error will be returned here if lock not acquired in given time
});

// Specify max occupation time - max amount of time allowed between entering the queue and completing execution
var lock = new AsyncLock({maxOccupationTime: 3000});
lock.acquire(key, fn, function(err, ret) {
	// occupation time exceeded error will be returned here if job not completed in given time
});

// Set max pending tasks - max number of tasks allowed in the queue at a time
var lock = new AsyncLock({maxPending: 1000});
lock.acquire(key, fn, function(err, ret) {
	// Handle too much pending error
})

// Whether there is any running or pending async function
lock.isBusy();

// Use your own promise library instead of the global Promise variable
var lock = new AsyncLock({Promise: require('bluebird')}); // Bluebird
var lock = new AsyncLock({Promise: require('q')}); // Q

// Add a task to the front of the queue waiting for a given lock
lock.acquire(key, fn1, cb); // runs immediately
lock.acquire(key, fn2, cb); // added to queue
lock.acquire(key, priorityFn, cb, {skipQueue: true}); // jumps queue and runs before fn2
```

## License

MIT, see [LICENSE](./LICENSE)