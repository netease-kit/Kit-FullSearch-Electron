/* eslint-disable @typescript-eslint/explicit-function-return-type */
export const queuePromise = (
  fn: (...args: any) => Promise<any>
): ((...args: any) => Promise<any>) => {
  const queue: any = []
  let lock = false
  return function (...args: any): Promise<any> {
    return new Promise(async (resolve, reject) => {
      queue.push({
        fn,
        args: [...args],
        resolve,
        reject,
      })
      if (lock) {
        return
      }
      lock = true
      while (queue.length) {
        const cur = queue.shift()
        try {
          // @ts-ignore
          const res = await cur.fn.apply(this, cur.args)
          cur.resolve(res)
        } catch (error) {
          cur.reject(error)
        }
      }
      lock = false
    })
  }
}

export function promisify(func, instance) {
  return (...arg: any) =>
    new Promise((resolve, reject) => {
      func.call(instance, ...arg, (err, result) => {
        if (err) reject(err)
        else resolve(result)
      })
    })
}

export function promisifyForDone(func, instance) {
  return (obj: any) =>
    new Promise((resolve, reject) => {
      func.call(instance, {
        ...obj,
        done(err, result) {
          if (err) reject(err)
          else resolve(result)
        },
      })
    })
}