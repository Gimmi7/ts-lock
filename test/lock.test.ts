import { AsyncLock } from '../src/AsyncLock.js';

const lock = new AsyncLock()
const key = "wangcy"

const obj = {
  i: 0
}

await Promise.all([
  lock.acquire(key, addi),
  lock.acquire(key, addi),
  lock.acquire(key, addi),
  lock.acquire(key, addi),
  lock.acquire(key, addi),
])

async function addi() {
  const oldi = obj.i
  console.log(new Date(), "oldi=", oldi)
  const p = new Promise<void>(resolve => {
    setTimeout(() => {
      resolve()
    }, 2000);
  })
  await p
  obj.i = oldi + 1
  console.log(new Date(), "newi=", obj.i)
}